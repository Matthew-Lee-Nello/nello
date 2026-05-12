/**
 * ClaudeBuddy — Claude Code mascot.
 * Static webp asset shown with a subtle idle scale-pulse.
 */
'use client'

interface ClaudeBuddyProps {
  size?: number
  className?: string
}

export function ClaudeBuddy({ size = 180, className }: ClaudeBuddyProps) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/buddies/claude-code-mascot.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        width={size}
        height={size}
        className={`claude-buddy-img select-none ${className ?? ''}`}
        style={{
          width: size,
          height: size,
          imageRendering: 'pixelated',
          mixBlendMode: 'multiply',
        }}
      />
      <style jsx>{`
        @keyframes claude-buddy-breathe {
          0%, 100% { transform: scale(1);    opacity: 0.95; }
          50%      { transform: scale(1.06); opacity: 1;    }
        }
        :global(.claude-buddy-img) {
          animation: claude-buddy-breathe 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          transform-origin: center;
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.claude-buddy-img) { animation: none; }
        }
      `}</style>
    </>
  )
}
