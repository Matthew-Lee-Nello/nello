import Link from 'next/link'
import { notFound } from 'next/navigation'

interface Step {
  do: string
  detail?: string
  pasteHere?: string
}

interface Doc {
  title: string
  intro: string
  steps: Step[]
  troubleshoot?: { problem: string; fix: string }[]
}

const PROVIDERS: Record<string, Doc> = {
  telegram: {
    title: 'Telegram bot token',
    intro: 'A Telegram bot is a free account type. Free forever. Takes 60 seconds.',
    steps: [
      { do: 'Open Telegram on your phone or desktop.', detail: 'If you do not have it: telegram.org/download.' },
      { do: 'In the search bar at the top, type @BotFather.', detail: 'Tap the one with the blue tick.' },
      { do: 'Press Start. You will see a menu of commands.' },
      { do: 'Send the message: /newbot' },
      { do: 'BotFather asks for a display name. Type any name you like.', detail: 'e.g. "My Brain". This is what shows above the chat.' },
      { do: 'BotFather asks for a username. Must end in "bot".', detail: 'e.g. "my_brain_bot". If taken, try another.' },
      { do: 'BotFather replies with a long string starting with numbers and a colon.', pasteHere: 'TELEGRAM_BOT_TOKEN' },
      { do: 'Copy that string. Give it to your assistant when it asks for your Telegram bot token.' },
    ],
    troubleshoot: [
      { problem: 'Username already taken', fix: 'Try another username with "bot" at the end. Add numbers if needed.' },
      { problem: 'BotFather did not reply', fix: 'Send /newbot again. Sometimes the message gets lost.' },
    ],
  },

  composio: {
    title: 'Composio (connect Gmail, Calendar, Drive, Slack, Notion + 1000 more)',
    intro: 'One key connects every app your assistant touches. No Google Cloud project, no client IDs, no secrets - and it can never delete or trash anything, only read, send and create. Takes about a minute.',
    steps: [
      { do: 'Open https://dashboard.composio.dev in your browser.' },
      { do: 'Sign up with Google or email. The free tier is plenty to start.' },
      { do: 'Find your API key (Settings → API Keys, or shown on the home screen). It starts with "ak_".', pasteHere: 'COMPOSIO_API_KEY' },
      { do: 'Give that key to your assistant when it asks during setup.', detail: 'It is the only Composio value you ever paste.' },
      { do: 'After install, tell your assistant "connect my Gmail and Calendar" - or Slack, Notion, your CRM, anything.' },
      { do: 'It hands you a link. Open it, pick your account, click Allow. Done - it can now read, send and create in that app, never delete.' },
    ],
    troubleshoot: [
      { problem: 'The app I want is not listed', fix: 'Just ask your assistant to connect it by name. Composio covers 1000+ apps; if one is genuinely missing, your assistant can wire a direct connection instead.' },
      { problem: 'A connect link says it expired', fix: 'Ask your assistant for a fresh one - the links are single-use and time out after a while.' },
    ],
  },

  exa: {
    title: 'Exa API key (research skill)',
    intro: 'Exa is semantic web search built for LLMs. Used by the research skill. Free tier covers casual use.',
    steps: [
      { do: 'Open https://exa.ai in your browser.' },
      { do: 'Click Get API Key (top right) or go directly to dashboard.exa.ai.' },
      { do: 'Sign up with Google or email.' },
      { do: 'On the dashboard, click API Keys in the left sidebar.' },
      { do: 'Click Create New Key. Name it "nello".' },
      { do: 'Copy the key. It starts with random characters.', pasteHere: 'EXA_API_KEY' },
      { do: 'Give it to your assistant when it asks for your Exa key.' },
    ],
  },

}

export default async function ProviderDoc({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const doc = PROVIDERS[provider]
  if (!doc) notFound()

  return (
    <div className="hero" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 36 }}>{doc.title}</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)' }}>{doc.intro}</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Steps</h2>
      <ol style={{ paddingLeft: 24, lineHeight: 1.9 }}>
        {doc.steps.map((s, i) => (
          <li key={i} style={{ marginBottom: 14 }}>
            <div>{s.do}</div>
            {s.detail && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{s.detail}</div>}
            {s.pasteHere && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent)' }}>
                → paste into <code>{s.pasteHere}</code>
              </div>
            )}
          </li>
        ))}
      </ol>

      {doc.troubleshoot && (
        <>
          <h2 style={{ fontSize: 18, marginTop: 32 }}>If something goes wrong</h2>
          <ul style={{ paddingLeft: 24, lineHeight: 1.7 }}>
            {doc.troubleshoot.map((t, i) => (
              <li key={i} style={{ marginBottom: 10 }}>
                <strong>{t.problem}</strong> — {t.fix}
              </li>
            ))}
          </ul>
        </>
      )}

      <p style={{ marginTop: 40 }}>
        <Link href="/docs">← back to docs</Link>{'  '}|{'  '}
        <Link href="/wizard">continue the wizard →</Link>
      </p>
    </div>
  )
}
