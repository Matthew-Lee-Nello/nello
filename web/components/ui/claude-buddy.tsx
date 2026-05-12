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

      {/* Eyes are baked into the image now — no overlay needed. */}
    </div>
  )
}
