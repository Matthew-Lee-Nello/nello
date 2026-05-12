/**
 * ClaudeBuddy — chonk species, idle animation.
 *
 * ASCII pose data ported from
 * https://github.com/anthropics/claude-desktop-buddy/blob/main/src/buddies/chonk.cpp
 * Copyright 2026 Anthropic, PBC — MIT License.
 *
 * Each pose is a 12-wide × 5-tall character grid. We render it as coloured
 * pixel blocks via CSS Grid so it reads as proper pixel art at any size,
 * not raw punctuation. Eye-like characters get the ink colour, every other
 * non-space char gets the body colour, spaces are transparent.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'

const GRID_W = 12
const GRID_H = 5

// chonk idle poses, verbatim from chonk.cpp doIdle()
const REST   = '            \n  /\\____/\\  \n ( o    o ) \n (   ..   ) \n  `------\'  '
const LOOK_L = '            \n  /\\____/\\  \n (o     o ) \n (   ..   ) \n  `------\'  '
const LOOK_R = '            \n  /\\____/\\  \n ( o     o) \n (   ..   ) \n  `------\'  '
const LOOK_U = '            \n  /\\____/\\  \n ( \'    \' ) \n (   ..   ) \n  `------\'  '
const BLINK  = '            \n  /\\____/\\  \n ( -    - ) \n (   ..   ) \n  `------\'  '
const EAR_L  = '            \n  /|____/\\  \n ( o    o ) \n (   ..   ) \n  `------\'  '
const EAR_R  = '            \n  /\\____|\\  \n ( o    o ) \n (   ..   ) \n  `------\'  '
const JIG_A  = '            \n  /\\____/\\  \n ( o    o ) \n(    ..    )\n (________) '
const JIG_B  = '            \n  /\\____/\\  \n ( o    o ) \n (   ..   ) \n(__________)'
const SNIFF  = '            \n  /\\____/\\  \n ( o    o ) \n (   oo   ) \n  `------\'  '

const POSES = [REST, LOOK_L, LOOK_R, LOOK_U, BLINK, EAR_L, EAR_R, JIG_A, JIG_B, SNIFF]

// SEQ from chonk.cpp — 36 beats, ~16s cycle at the firmware's tick rate.
const IDLE_SEQ = [
  0,0,0,4,0,1,1,0,
  2,2,0,4,
  5,0,6,0,
  0,3,3,0,
  7,8,7,8,
  0,0,4,0,
  9,9,0,0,
  0,5,6,0,
]

const IDLE_FRAMES = IDLE_SEQ.map((i) => POSES[i])

const EYE_CHARS = new Set(['o', 'O', '-', '^', 'v', '*', "'", '.'])

interface Cell {
  kind: 'body' | 'eye' | 'space'
}

function parseFrame(frame: string): Cell[] {
  const lines = frame.split('\n')
  const cells: Cell[] = []
  for (let r = 0; r < GRID_H; r++) {
    const line = lines[r] ?? ''
    for (let c = 0; c < GRID_W; c++) {
      const ch = line[c] ?? ' '
      if (ch === ' ') cells.push({ kind: 'space' })
      else if (EYE_CHARS.has(ch)) cells.push({ kind: 'eye' })
      else cells.push({ kind: 'body' })
    }
  }
  return cells
}

interface ClaudeBuddyProps {
  /** Width in px; height auto from aspect ratio. */
  size?: number
  /** ms per pose. Firmware uses ~440ms. */
  frameMs?: number
  bodyColor?: string
  eyeColor?: string
  className?: string
}

export function ClaudeBuddy({
  size = 180,
  frameMs = 440,
  bodyColor = '#D97757', // Anthropic Crail — same as Claude mark
  eyeColor = '#14110E',
  className,
}: ClaudeBuddyProps) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setI((n) => (n + 1) % IDLE_FRAMES.length)
    }, frameMs)
    return () => clearInterval(id)
  }, [frameMs])

  const cells = useMemo(() => parseFrame(IDLE_FRAMES[i]), [i])
  const cellPx = size / GRID_W
  const height = cellPx * GRID_H

  return (
    <div
      aria-hidden="true"
      className={`grid select-none ${className ?? ''}`}
      style={{
        width: size,
        height,
        gridTemplateColumns: `repeat(${GRID_W}, 1fr)`,
        gridTemplateRows: `repeat(${GRID_H}, 1fr)`,
      }}
    >
      {cells.map((cell, idx) => (
        <div
          key={idx}
          style={{
            background:
              cell.kind === 'body'
                ? bodyColor
                : cell.kind === 'eye'
                ? eyeColor
                : 'transparent',
          }}
        />
      ))}
    </div>
  )
}
