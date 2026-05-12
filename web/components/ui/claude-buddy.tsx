/**
 * ClaudeBuddy — custom chonk pixel sprite.
 *
 * Hand-built 10x8 pixel grid matching the chunky coral creature with two ink
 * eyes and four little feet at the bottom. Inspired by the Claude Code /buddy
 * 'chonk' species (anthropics/claude-desktop-buddy) but drawn here as proper
 * pixel art rather than the original 12x5 ASCII glyph grid.
 *
 *   . = transparent (cream bg shows through)
 *   # = body (coral / Anthropic Crail #D97757)
 *   X = eye  (ink #14110E)
 */
'use client'

import { useEffect, useMemo, useState } from 'react'

const GRID_W = 10
const GRID_H = 8

// Idle frames — 5 poses. Eyes blink + look L/R while body stays still.
const REST = [
  '..######..',
  '.########.',
  '##XX##XX##',
  '##XX##XX##',
  '##########',
  '##########',
  '##########',
  '##..##..##',
].join('\n')

const BLINK = [
  '..######..',
  '.########.',
  '##########',
  '##--##--##',
  '##########',
  '##########',
  '##########',
  '##..##..##',
].join('\n')

const LOOK_L = [
  '..######..',
  '.########.',
  '#XX###XX##',
  '#XX###XX##',
  '##########',
  '##########',
  '##########',
  '##..##..##',
].join('\n')

const LOOK_R = [
  '..######..',
  '.########.',
  '##XX###XX#',
  '##XX###XX#',
  '##########',
  '##########',
  '##########',
  '##..##..##',
].join('\n')

const SMILE = [
  '..######..',
  '.########.',
  '##XX##XX##',
  '##XX##XX##',
  '##########',
  '##.####.##',
  '##########',
  '##..##..##',
].join('\n')

const POSES = [REST, BLINK, LOOK_L, LOOK_R, SMILE]

// Beat sequence — REST dominates, occasional blink / look / smile.
const IDLE_SEQ = [
  0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 0, 1, 0, 4, 0, 0, 0, 1, 0,
]
const IDLE_FRAMES = IDLE_SEQ.map((i) => POSES[i])

interface ClaudeBuddyProps {
  size?: number
  frameMs?: number
  bodyColor?: string
  eyeColor?: string
  className?: string
}

export function ClaudeBuddy({
  size = 180,
  frameMs = 500,
  bodyColor = '#D97757',
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

  const cells = useMemo(() => {
    const lines = IDLE_FRAMES[i].split('\n')
    const out: ('body' | 'eye' | 'space')[] = []
    for (let r = 0; r < GRID_H; r++) {
      const line = lines[r] ?? ''
      for (let c = 0; c < GRID_W; c++) {
        const ch = line[c] ?? '.'
        if (ch === '#') out.push('body')
        else if (ch === 'X' || ch === '-') out.push('eye')
        else out.push('space')
      }
    }
    return out
  }, [i])

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
      {cells.map((kind, idx) => (
        <div
          key={idx}
          style={{
            background:
              kind === 'body'
                ? bodyColor
                : kind === 'eye'
                ? eyeColor
                : 'transparent',
          }}
        />
      ))}
    </div>
  )
}
