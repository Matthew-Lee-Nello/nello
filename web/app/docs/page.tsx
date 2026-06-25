import Link from 'next/link'

export default function Docs() {
  return (
    <div className="hero">
      <h1>How it works</h1>
      <p style={{ fontSize: 18, color: 'var(--text)' }}>
        Nello is your own AI Chief Operating Officer. They live on your Mac, know everything
        you tell them, and just do the work.
      </p>
      <p>
        Paste one prompt into Claude Code. Your assistant interviews you, asks for a couple of
        keys, and sets itself up - about 15 minutes.
      </p>

      <h2 style={{ marginTop: 32 }}>What stays on your Mac</h2>
      <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
        <li>Every key you hand your assistant - never sent to us</li>
        <li>Every conversation you have with your assistant</li>
        <li>Your notes, your memory, your context - all local</li>
      </ul>

      <h2 style={{ marginTop: 32 }}>Connecting your accounts (step-by-step guides)</h2>
      <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
        <li><Link href="/docs/telegram">Telegram</Link> - so your assistant can text you anywhere. Free, takes 60 seconds.</li>
        <li><Link href="/docs/composio">Composio</Link> - one key connects Gmail, Calendar, Drive, Slack, Notion and 1000+ more. Free, about a minute.</li>
        <li><Link href="/docs/exa">Exa</Link> - smart web research for your assistant. Free tier, 1 minute.</li>
      </ul>

      <p style={{ marginTop: 24, color: 'var(--muted)', fontSize: 14 }}>
        Need anything else (Notion, Linear, GitHub, scraping, voice transcription)? Once your
        assistant is running, just say <em>&quot;find me a connection for X&quot;</em>. It walks you through it.
      </p>

      <p style={{ marginTop: 40 }}>
        <Link href="/wizard"><button>Set up my assistant</button></Link>{' '}
        <Link href="/audit"><button className="secondary">I already have a setup</button></Link>
      </p>
    </div>
  )
}
