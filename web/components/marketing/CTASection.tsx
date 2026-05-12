import Link from 'next/link'

export default function CTASection() {
  return (
    <section className="border-t border-[var(--border)] bg-[var(--panel)]">
      <div className="max-w-[760px] mx-auto px-6 py-[112px] text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)] mb-5">
          Ten-minute setup
        </p>
        <h2 className="font-serif text-[clamp(36px,5vw,60px)] leading-[1.05] tracking-[-0.012em] text-[var(--ink)] mb-5">
          Hand the admin off.{' '}
          <span className="italic text-[var(--accent)]">For good.</span>
        </h2>
        <p className="text-[17px] leading-[1.55] text-[var(--muted)] max-w-[560px] mx-auto mb-9">
          Your assistant lives on your own computer. Your keys, notes and conversations stay on
          your machine. Never on our servers.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/wizard">
            <button className="text-[14px] py-[14px] px-[28px]">Set up my assistant</button>
          </Link>
          <Link href="/audit">
            <button className="secondary text-[14px] py-[14px] px-[28px]">
              I already have Claude Code
            </button>
          </Link>
        </div>
      </div>
    </section>
  )
}
