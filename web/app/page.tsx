import Link from 'next/link'

export default function Landing() {
  return (
    <div className="hero">
      <h1><span>nello-claw</span></h1>
      <p style={{ fontSize: 24, color: 'var(--text)', marginBottom: 16, lineHeight: 1.3 }}>
        Your executive AI assistant. One that knows everything about you, and just does the job.
      </p>
      <p>
        Answer a few questions. Connect your accounts. Get an assistant that handles your
        inbox, your calendar, your notes, your follow-ups, your daily briefings - the admin
        work you do not want to do anymore.
      </p>

      <ul style={{ paddingLeft: 20, lineHeight: 1.9, color: 'var(--text)', marginTop: 24 }}>
        <li>Reads and writes your Gmail, Drive, Docs, Calendar (Google Workspace)</li>
        <li>Reads and writes your second brain + permanent memory (Obsidian vault)</li>
        <li>Researches the live web (Exa)</li>
        <li>Texts you from anywhere via Telegram, voice or text</li>
        <li>Remembers your projects, clients, decisions, preferences forever</li>
        <li>Runs custom scheduled tasks, to-dos and morning briefs while you sleep</li>
        <li>Plays a sound when it finishes a task so you can multitask while it works</li>
      </ul>

      <p style={{ marginTop: 24, color: 'var(--muted)' }}>
        Setup takes about ten minutes. Your assistant lives on your own computer. Your keys, notes
        and conversations stay on your machine - never on our servers.
      </p>

      <div style={{
        marginTop: 32,
        padding: 16,
        border: '1px solid var(--accent)',
        borderRadius: 8,
        background: 'var(--accent-dim)',
      }}>
        <strong style={{ color: 'var(--accent)' }}>Before you start</strong>
        <p style={{ margin: '8px 0 0', fontSize: 14 }}>
          You need <a href="https://claude.com/product/claude-code" target="_blank" rel="noopener">Claude Code</a> installed and signed in first.
          Works on Mac, Windows and Linux. Free with any Claude.ai plan.
        </p>
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Tip:</strong> when you paste the install command, hit <kbd style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>Shift+Tab</kbd> twice in Claude Code to switch on <strong>Plan Mode</strong>. Your assistant will lay out exactly what it is about to do before touching anything. Approve, then it runs.
        </p>
      </div>

      <div className="cta" style={{ marginTop: 32 }}>
        <Link href="/wizard"><button>Set up my assistant</button></Link>
        <Link href="/audit"><button className="secondary">I already have Claude Code</button></Link>
      </div>

      <p style={{ marginTop: 32, fontSize: 13 }}>
        <Link href="/docs">How it works →</Link>
      </p>
    </div>
  )
}
