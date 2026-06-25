'use client'

import Link from 'next/link'
import { useState } from 'react'

const UPDATE_PROMPT = `I already have Nello installed on this machine and I want to update it to the latest version. Please run the update for me.

First, cd into my existing install folder - the one that has my .env, bundle.json and template/ in it. If you are not already there, find it and move into it. If you cannot find a folder with those three things, stop and ask me where it is. Do not guess.

Once you are in the right folder, here is what I want:

1. Back up my .env, bundle.json, .mcp.json AND CLAUDE.md first (timestamped copies). CLAUDE.md is regenerated during the update, so back it up in case I made any hand edits.
2. Stop the background app so nothing runs mid-update.
3. Pull the latest code from the repo and rebuild it. Do this BEFORE you read the update guide, so you follow the newest UPDATE_GUIDE.md and not my old local copy.
4. Now read UPDATE_GUIDE.md from the repo (it is current after the pull) and follow it step by step for the rest.
5. If I am still on the old Google sign-in setup, move me over to the Composio Tool Router. It needs a single key from dashboard.composio.dev (it starts with "ak_"). Ask me for that key when you need it - it is the only thing I should have to paste. One key connects Gmail, Calendar, Drive and the rest. Remove the old Google sign-in entries and wire Composio in their place.
6. Refresh the assistant and re-link the skills so I get the newest persona and tools.
7. Restart the background app and verify everything is healthy.

Keep all my notes, my Memory, my Journal, my saved answers and my identity exactly as they are. None of that gets re-collected or wiped. Only the code, configs, skills and persona get refreshed.

If "/update" is not a recognised command, that is expected - older installs do not have it yet, and this prompt does not need it (the pull in step 3 adds it for next time). If this folder turns out not to be a git checkout, do not force anything - tell me, and we will do a fresh install in a new folder and copy my vault, .env and bundle.json across.

Confirm with me before anything destructive, and show me your plan before you start.`

export default function UpdatePage() {
  const [copied, setCopied] = useState(false)
  const lastUpdated = process.env.NEXT_PUBLIC_LAST_UPDATED
    ? new Date(process.env.NEXT_PUBLIC_LAST_UPDATED).toLocaleDateString('en-AU', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const copy = async () => {
    await navigator.clipboard.writeText(UPDATE_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="hero">
      <h1>A new <span>Nello</span> is out</h1>
      <p style={{ fontSize: 18, color: 'var(--text)', marginBottom: 12 }}>
        {lastUpdated ? `Latest build: ${lastUpdated}. ` : ''}If your assistant is older than that, paste one prompt to bring it up to date - without losing a thing.
      </p>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        Not sure if you're behind? Ask your assistant &quot;am I on the latest?&quot; or run <code>/install-doctor</code>.
      </p>

      <div style={{
        marginTop: 32,
        padding: 20,
        border: '1px solid var(--accent)',
        borderRadius: 10,
        background: 'var(--accent-dim)',
      }}>
        <strong style={{ color: 'var(--accent)' }}>What this does</strong>
        <p style={{ margin: '8px 0 12px', fontSize: 14 }}>
          Pulls the newest code, rebuilds, and refreshes your assistant and skills. If you set things up with the old Google sign-in, it moves you over to the new one-key connection layer (Composio). You grab one key from dashboard.composio.dev and paste it once. Your notes, Memory, Journal and saved answers stay exactly where they are.
        </p>
      </div>

      <div style={{ marginTop: 24, padding: 20, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)' }}>
        <strong style={{ color: 'var(--accent)' }}>How to run it</strong>
        <p style={{ margin: '8px 0 12px', fontSize: 14 }}>
          Open Claude Code inside your existing Nello folder (the one with your .env and template/ in it). Paste this prompt. Your assistant reads the update guide, shows you its plan, and checks with you before anything risky.
        </p>

        <div className="install-command" onClick={copy} style={{ cursor: 'pointer', whiteSpace: 'pre-wrap' }}>
          {UPDATE_PROMPT}
        </div>
        <button onClick={copy} style={{ marginTop: 12 }}>{copied ? 'Copied' : 'Copy to clipboard'}</button>
      </div>

      <h2 style={{ marginTop: 48, fontSize: 18 }}>What stays, what changes?</h2>
      <p>
        Everything personal stays. Your notes, your Memory, your Journal, the answers you gave during setup, the owner lock on your Telegram. There is no re-interview. Only the code, the configs, the skills and the assistant's persona get refreshed.
      </p>
      <p style={{ marginTop: 12 }}>
        If you are moving off the old Google sign-in, the change is one key. You paste a single Composio key, and that one connection covers Gmail, Calendar, Drive and more. The old per-app sign-in goes away, so you stop getting asked for it.
      </p>

      <h2 style={{ marginTop: 32, fontSize: 18 }}>Haven't installed yet?</h2>
      <p>
        <Link href="/wizard">Skip this page. Just set up your assistant →</Link>
      </p>
    </div>
  )
}
