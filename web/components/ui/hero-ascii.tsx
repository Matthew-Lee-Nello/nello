'use client'

import Link from 'next/link'
import { Typewriter } from '@/components/ui/typewriter'
import { ClaudeBuddy } from '@/components/ui/claude-buddy'

// Claude mark — official path from claude.ai/favicon.svg (Anthropic Crail #D97757)
const claudePath =
  'M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.485 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z'

function ClaudeMark({ size = 280 }: { size?: number }) {
  return (
    <svg
      className="claude-mark"
      viewBox="0 0 248 248"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      <path d={claudePath} fill="#D97757" />
    </svg>
  )
}

export default function HeroAscii() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* Dot grid backdrop — uniform ASCII-style dots, no Vitruvian man, no JS */}
      <div className="absolute inset-0 z-0 dot-grid pointer-events-none" />

      {/* Corner Frame Accents */}
      <div className="absolute top-0 left-0 w-8 h-8 lg:w-12 lg:h-12 border-t-2 border-l-2 border-[var(--ink)]/25 z-20" />
      <div className="absolute top-0 right-0 w-8 h-8 lg:w-12 lg:h-12 border-t-2 border-r-2 border-[var(--ink)]/25 z-20" />
      <div className="absolute bottom-0 left-0 w-8 h-8 lg:w-12 lg:h-12 border-b-2 border-l-2 border-[var(--ink)]/25 z-20" />
      <div className="absolute bottom-0 right-0 w-8 h-8 lg:w-12 lg:h-12 border-b-2 border-r-2 border-[var(--ink)]/25 z-20" />

      {/* Byline — bottom-left */}
      <div className="absolute bottom-5 left-16 lg:bottom-6 lg:left-20 z-20 text-[10px] lg:text-[11px] font-mono tracking-wider text-[var(--muted)] opacity-75 select-none">
        meticulously crafted by{' '}
        <span className="text-[var(--ink)]">Matthew Lee</span>
        {' '}<span className="text-[var(--ink)]/60">@</span> NELLO LABS
      </div>

      {/* Copyright — bottom-right */}
      <div className="absolute bottom-5 right-16 lg:bottom-6 lg:right-20 z-20 text-[10px] lg:text-[11px] font-mono tracking-wider text-[var(--muted)] opacity-75 select-none">
        © NELLO LABS 2026
      </div>

      {/* Hero — content + mark, centred together as one group */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 lg:px-12">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
          {/* Text column — zoom 0.65 reflows so flex centres the smaller box */}
          <div style={{ zoom: 0.65 }} className="shrink-0">
            <div className="max-w-lg relative">
              <div className="flex items-center gap-2 mb-4 opacity-70">
                <div className="w-8 h-px bg-[var(--ink)]" />
                <span className="text-[var(--ink)] text-[10px] font-mono tracking-wider">001</span>
                <div className="flex-1 h-px bg-[var(--ink)]" />
              </div>

              <div className="relative">
                <div className="hidden lg:block absolute -left-3 top-0 bottom-0 w-1 dither-pattern opacity-50" />
                <h1
                  className="text-3xl lg:text-6xl font-bold text-[var(--ink)] mb-4 leading-[1.05] font-mono tracking-wider"
                  style={{ letterSpacing: '0.08em' }}
                >
                  YOUR
                  <span className="block text-[var(--ink)] mt-1 lg:mt-2 opacity-95">
                    <Typewriter
                      text={['AI COO', 'SECOND BRAIN', '24/7 EMPLOYEE']}
                      speed={90}
                      deleteSpeed={50}
                      waitTime={2200}
                      cursorChar="_"
                      cursorClassName="ml-0"
                    />
                  </span>
                </h1>
              </div>

              <div className="hidden lg:flex gap-1 mb-4 opacity-50">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div key={i} className="w-0.5 h-0.5 bg-[var(--ink)] rounded-full" />
                ))}
              </div>

              <div className="relative">
                <p className="text-xs lg:text-base text-[var(--muted)] mb-6 lg:mb-8 leading-relaxed font-mono max-w-md">
                  An AI Chief Operations Officer that knows everything about you, and just does the job.
                </p>
                <div
                  className="hidden lg:block absolute -right-4 top-1/2 w-3 h-3 border border-[var(--ink)]/30"
                  style={{ transform: 'translateY(-50%)' }}
                >
                  <div
                    className="absolute top-1/2 left-1/2 w-1 h-1 bg-[var(--ink)]"
                    style={{ transform: 'translate(-50%, -50%)' }}
                  />
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
                <Link href="/wizard" className="contents">
                  <button
                    type="button"
                    className="relative px-5 lg:px-6 py-2 lg:py-2.5 bg-transparent text-[var(--ink)] font-mono text-xs lg:text-sm border border-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg)] transition-all duration-200 group rounded-none tracking-wider"
                    style={{ letterSpacing: '0.12em' }}
                  >
                    <span className="hidden lg:block absolute -top-1 -left-1 w-2 h-2 border-t border-l border-[var(--ink)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="hidden lg:block absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-[var(--ink)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    SET UP MY ASSISTANT
                  </button>
                </Link>

                <Link href="/audit" className="contents">
                  <button
                    type="button"
                    className="relative px-5 lg:px-6 py-2 lg:py-2.5 bg-transparent border border-[var(--ink)]/60 text-[var(--ink)] font-mono text-xs lg:text-sm hover:bg-[var(--ink)] hover:text-[var(--bg)] transition-all duration-200 rounded-none tracking-wider"
                    style={{ letterSpacing: '0.12em' }}
                  >
                    I HAVE CLAUDE CODE
                  </button>
                </Link>
              </div>

              <div className="hidden lg:flex items-center gap-2 mt-8 opacity-50">
                <span className="text-[var(--ink)] text-[9px] font-mono">∞</span>
                <div className="flex-1 h-px bg-[var(--ink)]" />
                <span className="text-[var(--ink)] text-[9px] font-mono tracking-[0.22em]">NELLO LABS</span>
              </div>
            </div>
          </div>

          {/* Claude mark + little buddy stacked */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <ClaudeMark size={280} />
            <ClaudeBuddy
              state="idle"
              frameMs={420}
              className="text-[var(--ink)] text-[14px] lg:text-[15px] opacity-80"
            />
          </div>
        </div>
      </div>

      <style jsx>{`
        /* Dramatic breath — mimics Claude app icon: shrinks small, expands back.
           Pattern adapted from Apple Watch Breathe (scale 0.15 → 1, 4s,
           cubic-bezier(0.5,0,0.5,1)). Tuned for headline placement. */
        @keyframes claude-pulse {
          0%, 100% { transform: scale(0.22); opacity: 0.55; }
          50%      { transform: scale(0.86); opacity: 1;    }
        }
        :global(.claude-mark) {
          animation: claude-pulse 3.6s cubic-bezier(0.5, 0, 0.5, 1) infinite;
          transform-origin: center;
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.claude-mark) { animation: none; opacity: 1; transform: none; }
        }
        .dither-pattern {
          background-image:
            repeating-linear-gradient(0deg, transparent 0px, transparent 1px, var(--ink) 1px, var(--ink) 2px),
            repeating-linear-gradient(90deg, transparent 0px, transparent 1px, var(--ink) 1px, var(--ink) 2px);
          background-size: 3px 3px;
        }
        .dot-grid {
          position: absolute;
          inset: 0;
        }
        .dot-grid::before,
        .dot-grid::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, var(--ink) 1px, transparent 1.4px);
          background-size: 22px 22px;
          will-change: opacity;
        }
        .dot-grid::before {
          background-position: 0 0;
          opacity: 0.18;
          animation: dot-flicker-a 3.2s ease-in-out infinite;
        }
        .dot-grid::after {
          background-position: 11px 11px;
          opacity: 0.06;
          animation: dot-flicker-b 4.8s ease-in-out infinite;
        }
        @keyframes dot-flicker-a {
          0%, 100% { opacity: 0.18; }
          50%      { opacity: 0.06; }
        }
        @keyframes dot-flicker-b {
          0%, 100% { opacity: 0.04; }
          50%      { opacity: 0.16; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dot-grid::before, .dot-grid::after { animation: none; }
        }
      `}</style>
    </main>
  )
}
