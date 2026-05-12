/**
 * ClaudeBuddy — Anthropic's bufo character pack from
 * https://github.com/anthropics/claude-desktop-buddy/tree/main/characters/bufo
 * Copyright 2026 Anthropic, PBC — MIT License.
 *
 * Assets shipped under web/public/buddies/bufo/. Browsers loop animated
 * GIFs natively, so the component is just an <img> with random idle pick.
 */
'use client'

import { useEffect, useState } from 'react'

type BuddyState =
  | 'sleep'
  | 'idle'
  | 'busy'
  | 'attention'
  | 'celebrate'
  | 'dizzy'
  | 'heart'

interface ClaudeBuddyProps {
  state?: BuddyState
  size?: number
  className?: string
}

// The 9 idle variants the firmware ships with. Browser loops each natively.
const IDLE_COUNT = 9

export function ClaudeBuddy({
  state = 'idle',
  size = 180,
  className,
}: ClaudeBuddyProps) {
  // Deterministic on SSR (idle_0), then randomised on client so it doesn't
  // hydration-mismatch and so each load shows a different bufo.
  const [src, setSrc] = useState<string>('/buddies/bufo/idle_0.gif')

  useEffect(() => {
    if (state === 'idle') {
      const pick = Math.floor(Math.random() * IDLE_COUNT)
      setSrc(`/buddies/bufo/idle_${pick}.gif`)
    } else {
      setSrc(`/buddies/bufo/${state}.gif`)
    }
  }, [state])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`select-none ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
      }}
    />
  )
}
