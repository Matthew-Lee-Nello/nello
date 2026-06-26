#!/usr/bin/env node
/**
 * scripts/release.js — cut a new Nello version in one step.
 *
 * Version numbers stay simple: 1.1 -> 1.2 -> 1.3, with a bigger jump for a bigger
 * release. Storage is standard 3-part semver (1.3.0) so npm + the GitHub release link
 * stay valid; the owner-facing UI drops the trailing ".0" and shows "v1.3".
 *
 * This bumps VERSION, syncs every package.json in the repo to match (no more files
 * frozen on an old version), and scaffolds the next CHANGELOG.md entry so you just fill
 * in the bullets. It does NOT push or tag.
 *
 * Usage:
 *   node scripts/release.js            # minor +1     (1.2.0 -> 1.3.0)  ← the default
 *   node scripts/release.js --jump 2   # bigger jump  (1.2.0 -> 1.4.0)
 *   node scripts/release.js --major    # major        (1.2.0 -> 2.0.0)
 *   node scripts/release.js 2.1.0      # explicit target
 *   ...add --commit to also `git add` + commit VERSION + CHANGELOG + the package.jsons.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERSION_FILE = join(ROOT, 'VERSION')
const CHANGELOG = join(ROOT, 'CHANGELOG.md')
const REPO_URL = 'https://github.com/Matthew-Lee-Nello/nello'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')

const parseVer = (s) => String(s).trim().replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
const cmp = (a, b) => { const pa = parseVer(a), pb = parseVer(b); for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1 } return 0 }
const display = (v) => String(v).replace(/\.0$/, '')

const cur = readFileSync(VERSION_FILE, 'utf-8').trim()
const [maj, min] = parseVer(cur)

// Decide the next version: explicit x.y[.z] wins, then --major, then --jump N, else minor+1.
const jumpIdx = args.indexOf('--jump')
const jumpValue = jumpIdx >= 0 ? args[jumpIdx + 1] : null
// A positional that looks like a version target. Accept a leading "v" (that's how owners
// see it, e.g. "v1.5"); if it looks version-ish but doesn't parse, FAIL loudly instead of
// silently falling through to a default bump and cutting the wrong release. Exclude the
// value that belongs to --jump so "--jump 2" isn't read as a target.
const versionish = args.find(a => a !== jumpValue && /^v?\d/.test(a) && a.includes('.'))
const explicit = versionish && /^v?\d+\.\d+(\.\d+)?$/.test(versionish) ? versionish : null
if (versionish && !explicit) {
  console.error(`Not a valid version target: ${versionish}. Use x.y or x.y.z (e.g. 1.5 or 1.5.0).`)
  process.exit(1)
}
let next
if (explicit) {
  const p = parseVer(explicit); next = `${p[0]}.${p[1] || 0}.${p[2] || 0}`
} else if (args.includes('--major')) {
  next = `${maj + 1}.0.0`
} else {
  let jump = 1
  if (jumpIdx >= 0) {
    const tok = args[jumpIdx + 1]
    if (!/^\d+$/.test(tok || '') || parseInt(tok, 10) < 1) {
      console.error('--jump needs a positive whole number (e.g. --jump 2).'); process.exit(1)
    }
    jump = parseInt(tok, 10)
  }
  next = `${maj}.${min + jump}.0`
}

if (cmp(next, cur) <= 0) {
  console.error(`Refusing: ${next} is not greater than the current ${cur}.`)
  process.exit(1)
}

// 1. VERSION (the single source of truth the announce reads).
writeFileSync(VERSION_FILE, next + '\n')

// 2. Sync every package.json in the repo so none is left on an old version. Walk the tree,
//    skipping build/vendor dirs; only touch files that actually carry a "version" field.
const SKIP = new Set(['node_modules', 'dist', '.next', '.git', '.turbo', 'build'])
function findPackageJsons(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) findPackageJsons(p, out)
    else if (e.name === 'package.json') out.push(p)
  }
  return out
}
const pkgs = findPackageJsons(ROOT)
let synced = 0
for (const p of pkgs) {
  try {
    const j = JSON.parse(readFileSync(p, 'utf-8'))
    if (!('version' in j) || j.version === next) continue
    j.version = next
    writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
    synced++
  } catch { /* skip an unreadable/odd package.json */ }
}

// 3. Scaffold the next CHANGELOG entry, inserted above the newest existing release block.
const month = new Date().toISOString().slice(0, 7) // YYYY-MM
const entry = [
  `## [${next}] - ${month}`,
  '',
  '<!-- one-line summary of this release -->',
  '',
  '### Added',
  '- ',
  '',
  '### Changed',
  '- ',
  '',
  '### Caveats',
  '- ',
  '',
  `[${next}]: ${REPO_URL}/releases/tag/v${next}`,
  '',
].join('\n')

const cl = readFileSync(CHANGELOG, 'utf-8')
const idx = cl.search(/^## \[/m)
writeFileSync(CHANGELOG, idx >= 0 ? cl.slice(0, idx) + entry + '\n' + cl.slice(idx) : cl + '\n' + entry)

console.log(`Bumped ${cur} -> ${next}  (owners see v${display(next)}).`)
console.log(`Synced ${synced} package.json file(s) to ${next}.`)
console.log(`Scaffolded CHANGELOG entry [${next}] - fill in the bullets.`)

if (COMMIT) {
  try {
    execSync(`git add VERSION CHANGELOG.md ${pkgs.map(p => JSON.stringify(p)).join(' ')}`, { cwd: ROOT, stdio: 'inherit' })
    execSync(`git commit -m ${JSON.stringify(`release: v${next}`)}`, { cwd: ROOT, stdio: 'inherit' })
  } catch (e) { console.error('commit failed:', e.message) }
} else {
  console.log('Next: fill the CHANGELOG bullets, then commit VERSION + CHANGELOG + the package.json changes.')
}
