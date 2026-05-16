/**
 * NELLO Labs — canonical brand palette.
 *
 * Mirror of the CSS variables defined in web/app/globals.css.
 * Human-readable spec: NELLO/Wiki-Style-Canonical-Brand-Palette.md.
 *
 * Change order: globals.css -> this file -> the wiki -> regenerate
 * nello-palette.{html,png,pdf}.
 */

export const palette = {
  /** Warm cream — page background */
  bg: '#FAF7F2',
  /** Linen — cards, wizard screens */
  panel: '#F2EDE4',
  /** Hairline warm border */
  border: '#E6DFD3',
  /** Deep brown-black — body text */
  ink: '#14110E',
  /** Warm grey — secondary text, meta */
  muted: '#6B635A',
  /** Brass — links, focus, status */
  accent: '#C2872B',
  /** Deeper brass — hover state */
  accentStrong: '#A0701F',
  /** Brass wash — callout backgrounds, focus glow */
  accentDim: 'rgba(194, 135, 43, 0.10)',
} as const

export const brandAccents = {
  /** Anthropic Crail — Claude mark / Claude Code mascot */
  anthropicCrail: '#D97757',
  /** Success green — verified status / live indicator dots */
  successGreen: '#16a34a',
} as const

export type PaletteToken = keyof typeof palette
export type BrandAccentToken = keyof typeof brandAccents
