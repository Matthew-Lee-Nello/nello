/**
 * ClaudeBuddy — Claude Code mascot.
 *
 * Static body (image), animated eyes (overlay rectangles that shift
 * left-right on a slow loop). The source webp has white eye holes which
 * mix-blend-mode: multiply turns transparent on cream; the overlay fills
 * them with ink and adds the only motion on the sprite.
 */
'use client'

interface ClaudeBuddyProps {
  size?: number
  className?: string
  animateEyes?: boolean
}

export function ClaudeBuddy({
  size = 240,
  className,
  animateEyes = true,
}: ClaudeBuddyProps) {
  return (
    <div
      aria-hidden="true"
      className={`relative select-none ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/buddies/claude-code-mascot.webp"
        alt=""
        draggable={false}
        width={size}
        height={size}
        className="block"
        style={{
          width: size,
          height: size,
          imageRendering: 'pixelated',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Eye overlay — sits inside the white eye holes of the source image */}
      <div
        className={`absolute inset-0 pointer-events-none ${animateEyes ? 'claude-buddy-eyes' : ''}`}
      >
        {/* Left eye */}
        <div
          className="absolute"
          style={{
            left: '31.5%',
            top: '31%',
            width: '7%',
            height: '14%',
            background: '#14110E',
          }}
        />
        {/* Right eye */}
        <div
          className="absolute"
          style={{
            left: '61.5%',
            top: '31%',
            width: '7%',
            height: '14%',
            background: '#14110E',
          }}
        />
      </div>

      <style jsx>{`
        @keyframes claude-eye-look {
          0%, 18%, 100%   { transform: translateX(0); }
          28%, 42%        { transform: translateX(-2.5%); }
          55%, 70%        { transform: translateX(2.5%); }
          82%             { transform: translateX(0); }
        }
        :global(.claude-buddy-eyes) {
          animation: claude-eye-look 5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.claude-buddy-eyes) { animation: none; }
        }
      `}</style>
    </div>
  )
}
