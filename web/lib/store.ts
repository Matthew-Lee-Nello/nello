'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Bundle, Screen } from './types'
import { DEFAULT_BUNDLE } from './defaults'

interface WizardState {
  screen: Screen
  bundle: Bundle
  setScreen: (s: Screen) => void
  update: (patch: Partial<Bundle>) => void
  reset: () => void
}

export const useWizard = create<WizardState>()(
  persist(
    (set) => ({
      screen: 0,
      bundle: DEFAULT_BUNDLE,
      setScreen: (s) => set({ screen: s }),
      update: (patch) => set((st) => ({ bundle: { ...st.bundle, ...patch } })),
      reset: () => set({ screen: 0, bundle: DEFAULT_BUNDLE }),
    }),
    // v4 - 4-screen wizard (Watch / About / Connections / Build). Bumped so v3 visitors land on the intro, not stale state.
    { name: 'nello-claw-wizard-v4' }
  )
)
