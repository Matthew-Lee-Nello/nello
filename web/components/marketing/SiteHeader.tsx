import Link from 'next/link'

export default function SiteHeader() {
  return (
    <header className="w-full border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[1080px] mx-auto px-6 h-[64px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group" aria-label="NELLO Labs home">
          <span className="font-serif text-[22px] tracking-tight text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
            NELLO
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] mt-[6px]">
            Labs
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-[13px] text-[var(--muted)]">
          <Link href="/docs" className="hover:text-[var(--ink)] transition-colors">How it works</Link>
          <Link href="/wizard" className="hover:text-[var(--ink)] transition-colors">Set up</Link>
          <Link href="/audit" className="hover:text-[var(--ink)] transition-colors">Audit</Link>
        </nav>

        <Link href="/wizard">
          <button className="text-[13px] py-[8px] px-[16px]">Get started</button>
        </Link>
      </div>
    </header>
  )
}
