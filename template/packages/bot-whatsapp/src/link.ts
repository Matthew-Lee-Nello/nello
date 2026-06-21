/**
 * link.ts - one-shot WhatsApp linker for the /connect-whatsapp skill.
 *
 * Boots a SINGLE Baileys socket on the same session dir the daemon uses, renders
 * the pairing QR to a PNG (so the assistant can Read it and show it inside VS
 * Code), auto-captures the owner's number from the linked session, writes
 * WHATSAPP_OWNER_NUMBER into .env, and exits. The daemon must be stopped while
 * this runs - .wa-session must only ever have one live socket.
 *
 * It speaks to the skill through one-line sentinels on stdout:
 *   LINK_QR_READY <png> <ts>   a fresh QR PNG was written (re-emitted on ~20s rotation)
 *   LINK_PAIR_CODE <code>      pairing-code fallback (when run with --pair <number>)
 *   LINK_SUCCESS <number>      linked; owner number captured + written to .env
 *   LINK_401                   WhatsApp refused the link (throttled) - back off, don't retry fast
 *   LINK_TIMEOUT               no scan within the window
 *   LINK_CLOSED <code>         closed for another reason
 *   LINK_FAIL <msg>            could not link / capture the owner number
 *
 * Exit codes: 0 success, 1 fail, 2 throttled/loggedOut, 3 closed, 4 timeout.
 */
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { WHATSAPP_SESSION_DIR, PROJECT_ROOT, STORE_DIR } from '@nc/core'

const SESSION = WHATSAPP_SESSION_DIR
const QR_PNG = join(STORE_DIR, 'link-qr.png')
const ENV_PATH = join(PROJECT_ROOT, '.env')
const TIMEOUT_MS = 120_000

const argv = process.argv.slice(2)
const pairIdx = argv.indexOf('--pair')
const pairNumber = pairIdx >= 0 ? (argv[pairIdx + 1] || '').replace(/[^0-9]/g, '') : ''

function emit(line: string): void { process.stdout.write(line + '\n') }

// Mirror discovery.appendChatId: replace the line in place if present, else append.
function writeOwnerNumber(owner: string): void {
  if (!existsSync(ENV_PATH)) { appendFileSync(ENV_PATH, `WHATSAPP_OWNER_NUMBER=${owner}\n`); return }
  const cur = readFileSync(ENV_PATH, 'utf-8')
  if (/^WHATSAPP_OWNER_NUMBER=.*$/m.test(cur)) {
    writeFileSync(ENV_PATH, cur.replace(/^WHATSAPP_OWNER_NUMBER=.*$/m, `WHATSAPP_OWNER_NUMBER=${owner}`))
  } else {
    appendFileSync(ENV_PATH, `${cur.endsWith('\n') ? '' : '\n'}WHATSAPP_OWNER_NUMBER=${owner}\n`)
  }
}

let sock: WASocket | null = null
let reconnected515 = false
let pairRequested = false
let firstConnect = true
let initiallyRegistered = false
let done = false

function finish(code: number): void {
  if (done) return
  done = true
  try { sock?.end(undefined) } catch { /* socket already gone */ }
  // Grace on success so the final creds.update flushes before the process leaves.
  setTimeout(() => process.exit(code), code === 0 ? 1500 : 300)
}

async function connect(): Promise<void> {
  mkdirSync(SESSION, { recursive: true })
  mkdirSync(STORE_DIR, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(SESSION)
  // Remember whether valid creds already existed at the very start: a re-link opens
  // directly (no 515), a fresh pair must go through the 515 reconnect first.
  if (firstConnect) { initiallyRegistered = state.creds.registered === true; firstConnect = false }
  // Pull the live WhatsApp Web version; a stale one fails the handshake with
  // "Connection Failure". Fall back to a recent pinned version if unreachable.
  let version: [number, number, number]
  try { ({ version } = await fetchLatestBaileysVersion()) }
  catch { version = [2, 3000, 1033893291] }
  // Canonical browser label + macOS path: WhatsApp rejects non-standard strings for new links.
  sock = makeWASocket({ version, auth: state, browser: Browsers.macOS('Desktop') })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u

    // Pairing-code fallback (--pair): request the code from inside the handler on the
    // first connecting/qr event (Baileys requires the socket to have reached that
    // state), guarded so we ask exactly once and never on the post-pair reconnect.
    if (pairNumber && !pairRequested && !state.creds.registered && (connection === 'connecting' || qr)) {
      pairRequested = true
      try {
        const code = await sock!.requestPairingCode(pairNumber)
        emit(`LINK_PAIR_CODE ${code}`)
      } catch (e) {
        emit(`LINK_FAIL pairing-code request failed: ${(e as Error).message}`)
        return finish(1)
      }
      return
    }

    if (qr && !pairNumber) {
      try {
        await QRCode.toFile(QR_PNG, qr, { width: 380, margin: 2 })
        emit(`LINK_QR_READY ${QR_PNG} ${Date.now()}`)
      } catch (e) {
        emit(`LINK_FAIL qr png write failed: ${(e as Error).message}`)
      }
    }

    if (connection === 'open') {
      // For a FRESH pair, WhatsApp registers the device across an expected 515 restart:
      // the durable 'open' is the one AFTER that reconnect. Exiting on a transient
      // pre-515 'open' could leave registration incomplete and the daemon unable to
      // connect. A re-link of already-valid creds opens directly (no 515), so
      // initiallyRegistered short-circuits the wait.
      if (!initiallyRegistered && !reconnected515) return
      const raw = sock?.user?.id ?? ''
      // sock.user.id looks like '61476800885:12@s.whatsapp.net' - strip device + JID tail.
      const owner = raw.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
      if (owner.length < 8) { emit(`LINK_FAIL bad owner number from session: "${owner}"`); return finish(1) }
      // Flush the registered creds to disk BEFORE handing the session back to the daemon.
      try { await saveCreds() } catch { /* best-effort flush */ }
      writeOwnerNumber(owner)
      emit(`LINK_SUCCESS ${owner}`)
      return finish(0)
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
      // 515 (restartRequired) right after a pair is EXPECTED: reconnect ONCE with the
      // freshly saved creds. Never a second concurrent socket (reconnected515 guard).
      if (code === DisconnectReason.restartRequired && !reconnected515) {
        reconnected515 = true
        setTimeout(() => { connect().catch(err => { emit(`LINK_FAIL reconnect: ${String(err)}`); finish(1) }) }, 1000)
        return
      }
      // 401 / loggedOut = WhatsApp refused the link. Almost always its anti-abuse
      // throttle from repeated attempts. Back off; do not hammer.
      if (code === DisconnectReason.loggedOut || code === 401) {
        emit('LINK_401')
        return finish(2)
      }
      emit(`LINK_CLOSED ${code}`)
      return finish(3)
    }
  })
}

setTimeout(() => { emit('LINK_TIMEOUT'); finish(4) }, TIMEOUT_MS)

connect().catch(err => { emit(`LINK_FAIL ${String(err)}`); finish(1) })
