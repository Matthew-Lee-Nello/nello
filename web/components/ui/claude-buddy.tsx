/**
 * ClaudeBuddy — frame-cycling ASCII pet, based on
 * https://github.com/anthropics/claude-desktop-buddy
 * Copyright 2026 Anthropic, PBC — MIT License (for the ASCII frame data).
 */
'use client'

import { useEffect, useState } from 'react'
import { capybara, type BuddyState } from '@/components/ui/buddies/capybara'

interface ClaudeBuddyProps {
  state?: BuddyState
  frameMs?: number
  className?: string
}

export function ClaudeBuddy({
  state = 'idle',
  frameMs = 400,
  className,
}: ClaudeBuddyProps) {
  const frames = capybara[state] ?? capybara.idle
  const [i, setI] = useState(0)

  useEffect(() => {
    if (frames.length < 2) return
    const id = setInterval(() => {
      setI((n) => (n + 1) % frames.length)
    }, frameMs)
    return () => clearInterval(id)
  }, [frames, frameMs])

  return (
    <pre
      aria-hidden="true"
      className={`font-mono leading-[1.05] whitespace-pre select-none ${className ?? ''}`}
    >
      {frames[i]}
    </pre>
  )
}
