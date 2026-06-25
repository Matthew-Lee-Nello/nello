import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Company Brain - NELLO Labs',
  description: 'The architecture move that turns five separate dashboards into one database every staff member can query. Free deep-dive video, dropping soon.',
}

export default function CompanyBrain() {
  return (
    <div className="hero">
      <Image
        src="/logo.png"
        alt="NELLO Labs"
        width={72}
        height={72}
        priority
        style={{ marginBottom: 16 }}
      />
      <h1>The <span>Company Brain</span></h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20, marginTop: -8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Free deep-dive, dropping soon
      </p>

      <p style={{ fontSize: 22, color: 'var(--text)', marginBottom: 24, lineHeight: 1.3 }}>
        One database, many tabs, one chat box every staff member can query.
      </p>

      <p>
        Most growing businesses end up with one dashboard per function. Sales has a CRM. Procurement has a tracker. Accounting has Xero. HR has notes in Notion. Five logins, five mental models, no shared ground.
      </p>

      <p>
        The Company Brain is the architecture move that fixes all of it. Same data, different views. Like Gmail with inbox, starred and sent, all one store. Any staff member asks one chat box anything, gets a real answer pulled across every table.
      </p>

      <p>
        It is the highest-leverage thing in the whole NELLO system. So I made a separate free video that walks through the full architecture and the build order I would use.
      </p>

      <div style={{
        marginTop: 32,
        padding: 20,
        border: '1px solid var(--accent)',
        borderRadius: 8,
        background: 'var(--accent-dim)',
      }}>
        <strong style={{ color: 'var(--accent)', fontSize: 16 }}>Video coming soon</strong>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text)' }}>
          Filming the deep dive now. To get notified when it drops, join the NELLO Labs community below.
          No signup, no catch.
        </p>
      </div>

      <ul style={{ paddingLeft: 20, lineHeight: 1.9, color: 'var(--text)', marginTop: 24 }}>
        <li>Why dashboards-per-function break above 3 staff</li>
        <li>The unified-database pattern</li>
        <li>One chat box on top of all your data</li>
        <li>The build order I would use, function by function</li>
        <li>How to add data sources over time without breaking the brain</li>
      </ul>

      <div className="cta" style={{ marginTop: 32 }}>
        <Link href="https://www.skool.com/nello-labs-7795/about" target="_blank" rel="noopener">
          <button>Join NELLO Labs for the video drop</button>
        </Link>
        <Link href="/"><button className="secondary">Back to setup</button></Link>
      </div>

      <p style={{ marginTop: 32, fontSize: 13 }}>
        Already have Nello running? The framework prompt is live in your dashboard - run <code style={{ background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 4 }}>/nello-build</code> any time.
      </p>
    </div>
  )
}
