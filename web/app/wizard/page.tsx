'use client'

import { useWizard } from '@/lib/store'
import type { Screen } from '@/lib/types'
import Screen0Intro from '@/components/screens/Screen0Intro'
import Screen1Identity from '@/components/screens/Screen1Identity'
import Screen2Connections from '@/components/screens/Screen2Connections'
import Screen3Build from '@/components/screens/Screen3Build'

const LABELS: Record<Screen, string> = {
  0: 'Watch first',
  1: 'About you',
  2: 'Connections',
  3: 'Build',
}

export default function WizardPage() {
  const { screen, setScreen } = useWizard()

  return (
    <div className="wizard">
      <nav className="wizard-nav">
        <ol>
          {([0, 1, 2, 3] as Screen[]).map((n) => (
            <li
              key={n}
              className={`${screen === n ? 'active' : ''} ${screen > n ? 'done' : ''}`}
              onClick={() => setScreen(n)}
            >
              {n + 1}. {LABELS[n]}
            </li>
          ))}
        </ol>
      </nav>
      <main>
        {screen === 0 && <Screen0Intro />}
        {screen === 1 && <Screen1Identity />}
        {screen === 2 && <Screen2Connections />}
        {screen === 3 && <Screen3Build />}
      </main>
    </div>
  )
}
