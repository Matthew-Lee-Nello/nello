'use client'

import Link from 'next/link'
import { useState } from 'react'

const CONSOLIDATE_PROMPT = `I just installed NelloClaw fresh in this folder. I also have an older Claude Code setup somewhere on this machine.

Find my old setup. Common spots: ~/.claude/ for global settings, skills and plugins; ~/<old-project>/ with its own CLAUDE.md, .mcp.json, hooks; vault folders with markdown notes; any .env with API keys I might want.

For each piece you find, decide if it is worth pulling into NelloClaw and ask me y/n before importing:
- Skills under ~/.claude/skills/ that are not already in this install
- MCPs in the old project's .mcp.json that we do not have
- Useful prompt fragments or rules from the old CLAUDE.md
- Vault notes worth merging into nello-claw/vault/
- Scheduled tasks worth recreating

Do not modify or delete the old setup. Read only. If unsure, ask.

When done, give me a summary: what you imported, what you skipped and why, and what is left in the old setup that I might want to clean up later.`

export default function AuditPage() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(CONSOLIDATE_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="hero">
      <h1>Already running <span>Claude Code</span>?</h1>
      <p style={{ fontSize: 18, color: 'var(--text)', marginBottom: 12 }}>
        Don't try to merge during install. Start fresh, then consolidate.
      </p>

      <div style={{
        marginTop: 32,
        padding: 20,
        border: '1px solid var(--accent)',
        borderRadius: 10,
        background: 'var(--accent-dim)',
      }}>
        <strong style={{ color: 'var(--accent)' }}>Step 1 - Install fresh</strong>
        <p style={{ margin: '8px 0 12px', fontSize: 14 }}>
          Set up your assistant. Pick a clean folder (anything that is not your old project). NelloClaw installs cleanly into it. No conflicts with your existing Claude Code setup, no overwrites.
        </p>
        <Link href="/wizard"><button>Set up my assistant</button></Link>
      </div>

      <div style={{ marginTop: 24, padding: 20, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)' }}>
        <strong style={{ color: 'var(--accent)' }}>Step 2 - After install, consolidate</strong>
        <p style={{ margin: '8px 0 12px', fontSize: 14 }}>
          Once NelloClaw is running and you have the dashboard open, paste this prompt into Claude Code from inside your new project folder. Your assistant will scan your old setup and offer to import the useful bits one at a time.
        </p>

        <div className="install-command" onClick={copy} style={{ cursor: 'pointer', whiteSpace: 'pre-wrap' }}>
          {CONSOLIDATE_PROMPT}
        </div>
        <button onClick={copy} style={{ marginTop: 12 }}>{copied ? 'Copied' : 'Copy to clipboard'}</button>
      </div>

      <h2 style={{ marginTop: 48, fontSize: 18 }}>Why fresh + consolidate, not merge?</h2>
      <p>
        Merging an installer into an existing setup is fragile. Settings clash, hooks fight each other, MCPs get duplicated. A fresh folder is clean: you get the full installer running first, then your assistant pulls in your old work piece by piece, with you approving each one.
      </p>
      <p style={{ marginTop: 12 }}>
        Nothing in your old setup gets touched. You decide what to keep. The bits you skip stay where they are.
      </p>

      <h2 style={{ marginTop: 32, fontSize: 18 }}>Brand new to Claude Code?</h2>
      <p>
        <Link href="/wizard">Skip this page. Just set up your assistant →</Link>
      </p>
    </div>
  )
}
