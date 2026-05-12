import Link from 'next/link'

export default function BeforeYouStart() {
  return (
    <section className="border-t border-[var(--border)]">
      <div className="max-w-[760px] mx-auto px-6 py-[80px]">
        <div className="border border-[var(--accent)] bg-[var(--accent-dim)] rounded-[6px] p-[28px] md:p-[36px]">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--accent-strong)] mb-3">
            Before you start
          </p>
          <h3 className="font-serif text-[28px] md:text-[32px] leading-[1.15] tracking-[-0.01em] text-[var(--ink)] mb-3">
            You'll need Claude Code installed first.
          </h3>
          <p className="text-[15px] leading-[1.6] text-[var(--ink)] opacity-90 mb-5">
            Works on Mac, Windows and Linux. Free with any{' '}
            <Link
              href="https://claude.com/product/claude-code"
              target="_blank"
              rel="noopener"
              className="text-[var(--accent-strong)] underline underline-offset-2"
            >
              Claude.ai plan
            </Link>
            .
          </p>
          <p className="text-[14px] leading-[1.65] text-[var(--muted)]">
            <strong className="text-[var(--ink)] font-medium">Tip.</strong> When you paste the install
            command, hit{' '}
            <kbd className="bg-[var(--bg)] px-[6px] py-[2px] rounded-[3px] border border-[var(--border)] text-[12px] font-mono text-[var(--ink)]">
              Shift+Tab
            </kbd>{' '}
            twice in Claude Code to switch on{' '}
            <strong className="text-[var(--ink)] font-medium">Plan Mode</strong>. Your assistant
            lays out exactly what it's about to do before touching anything. Approve, then it
            runs.
          </p>
        </div>
      </div>
    </section>
  )
}
