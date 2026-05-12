'use client'

import { motion, useReducedMotion } from 'framer-motion'
import {
  Mail,
  BookOpenText,
  Globe2,
  MessageCircle,
  Brain,
  CalendarClock,
} from 'lucide-react'

const features = [
  {
    icon: Mail,
    title: 'Gmail, Drive, Docs, Calendar',
    body: 'Reads and writes your whole Google Workspace. Schedules meetings, drafts replies, files docs.',
  },
  {
    icon: BookOpenText,
    title: 'Your second brain',
    body: 'Plugs into your Obsidian vault. Permanent memory of clients, projects, decisions, preferences.',
  },
  {
    icon: Globe2,
    title: 'Live web research',
    body: 'Fetches the open web via Exa. Briefs on people, companies and topics in seconds.',
  },
  {
    icon: MessageCircle,
    title: 'Texts you from anywhere',
    body: 'Telegram with voice or text. Forward a message, dictate a task, get the work done.',
  },
  {
    icon: Brain,
    title: 'Remembers everything',
    body: 'Projects, clients, decisions, preferences. The longer it runs, the sharper it gets.',
  },
  {
    icon: CalendarClock,
    title: 'Runs while you sleep',
    body: 'Scheduled briefs, to-dos and custom routines fire on cron. A bell rings when each one lands.',
  },
]

export default function FeatureGrid() {
  const reduceMotion = useReducedMotion()
  const ease = [0.22, 1, 0.36, 1] as const

  return (
    <section className="border-t border-[var(--border)]">
      <div className="max-w-[1080px] mx-auto px-6 py-[96px]">
        <div className="max-w-[680px] mb-[56px]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)] mb-5">
            What it does
          </p>
          <h2 className="font-serif text-[clamp(34px,4.5vw,52px)] leading-[1.05] tracking-[-0.012em] text-[var(--ink)] mb-5">
            The admin work, handled.
          </h2>
          <p className="text-[16px] leading-[1.65] text-[var(--muted)]">
            One assistant, six surfaces. Lives on your own Mac. Your keys, notes and
            conversations never leave the machine.
          </p>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px] bg-[var(--border)] border border-[var(--border)] rounded-[8px] overflow-hidden">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.li
                key={f.title}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease, delay: reduceMotion ? 0 : 0.1 + i * 0.05 }}
                className="bg-[var(--bg)] p-[28px] flex flex-col gap-3 hover:bg-[var(--panel)] transition-colors"
              >
                <Icon
                  size={22}
                  strokeWidth={1.5}
                  className="text-[var(--accent)]"
                  aria-hidden
                />
                <h3 className="text-[16px] font-medium text-[var(--ink)]">{f.title}</h3>
                <p className="text-[14px] leading-[1.55] text-[var(--muted)]">{f.body}</p>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
