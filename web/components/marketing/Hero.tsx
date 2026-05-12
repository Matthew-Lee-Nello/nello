'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'

export default function Hero() {
  const reduceMotion = useReducedMotion()
  const stagger = reduceMotion ? 0 : 0.06
  const rise = reduceMotion ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }
  const ease = [0.22, 1, 0.36, 1] as const

  return (
    <section className="relative">
      <div className="max-w-[760px] mx-auto px-6 pt-[120px] md:pt-[140px] pb-[80px]">
        <motion.p
          {...rise}
          transition={{ duration: 0.6, ease, delay: 0 }}
          className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)] mb-8"
        >
          NELLO Labs · Built on the nello-claw workspace
        </motion.p>

        <motion.h1
          {...rise}
          transition={{ duration: 0.7, ease, delay: stagger }}
          className="font-serif text-[clamp(44px,7.5vw,84px)] leading-[1.02] tracking-[-0.012em] text-[var(--ink)] mb-7"
        >
          Your{' '}
          <span className="italic text-[var(--accent)]">
            AI Chief
          </span>{' '}
          <span className="italic text-[var(--accent)]">
            Operations Officer
          </span>
          .
        </motion.h1>

        <motion.p
          {...rise}
          transition={{ duration: 0.6, ease, delay: stagger * 2 }}
          className="text-[20px] md:text-[22px] leading-[1.45] text-[var(--ink)] max-w-[640px] mb-6"
        >
          Knows everything about you. Just does the job.
        </motion.p>

        <motion.p
          {...rise}
          transition={{ duration: 0.6, ease, delay: stagger * 3 }}
          className="text-[16px] leading-[1.65] text-[var(--muted)] max-w-[620px] mb-10"
        >
          Answer a few questions. Connect your accounts. Get an assistant that handles your
          inbox, your calendar, your notes, your follow-ups, your daily briefings - the admin
          work you don't want to do anymore.
        </motion.p>

        <motion.div
          {...rise}
          transition={{ duration: 0.6, ease, delay: stagger * 4 }}
          className="flex flex-wrap items-center gap-3"
        >
          <Link href="/wizard">
            <button className="text-[14px] py-[14px] px-[26px]">Set up my assistant</button>
          </Link>
          <Link href="/audit">
            <button className="secondary text-[14px] py-[14px] px-[26px]">
              I already have Claude Code
            </button>
          </Link>
          <Link
            href="/docs"
            className="ml-2 text-[13px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
          >
            How it works →
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
