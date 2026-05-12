import Link from 'next/link'

export default function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg)]">
      <div className="max-w-[1080px] mx-auto px-6 py-[56px] flex flex-col md:flex-row md:items-end md:justify-between gap-8">
        <div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-serif text-[22px] tracking-tight text-[var(--ink)]">NELLO</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Labs</span>
          </div>
          <p className="text-[13px] text-[var(--muted)] max-w-[320px] leading-[1.55]">
            An AI Chief Operations Officer that runs on your own Mac. Built on the nello-claw
            workspace.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-10 gap-y-2 text-[13px] text-[var(--muted)]">
          <Link href="/docs" className="hover:text-[var(--ink)] transition-colors">How it works</Link>
          <Link href="/wizard" className="hover:text-[var(--ink)] transition-colors">Set up</Link>
          <Link href="/audit" className="hover:text-[var(--ink)] transition-colors">Audit</Link>
          <Link href="/company-brain" className="hover:text-[var(--ink)] transition-colors">Company Brain</Link>
          <Link
            href="https://github.com/Matthew-Lee-Nello/nello-claw"
            target="_blank"
            rel="noopener"
            className="hover:text-[var(--ink)] transition-colors"
          >
            GitHub
          </Link>
        </div>
      </div>

      <div className="border-t border-[var(--border)]">
        <div className="max-w-[1080px] mx-auto px-6 py-5 text-[12px] text-[var(--muted)] flex flex-col md:flex-row md:justify-between gap-1">
          <span>© {new Date().getFullYear()} NELLO Pty Ltd · Brisbane, Australia</span>
          <span>Your keys stay on your machine.</span>
        </div>
      </div>
    </footer>
  )
}
