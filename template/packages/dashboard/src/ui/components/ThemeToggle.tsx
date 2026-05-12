import React, { useEffect, useState } from 'react'
import { Icon } from './Icon'

type Theme = 'light' | 'dark'

function readInitial(): Theme {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme as Theme
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('nc-theme')
    if (stored === 'light' || stored === 'dark') return stored
  }
  return 'light'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readInitial)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('nc-theme', theme) } catch {}
  }, [theme])

  const next: Theme = theme === 'light' ? 'dark' : 'light'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      style={{
        marginLeft: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 4,
        border: 'none',
        background: 'transparent',
        color: 'var(--muted)',
        cursor: 'pointer',
      }}
    >
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size={12} />
    </button>
  )
}
