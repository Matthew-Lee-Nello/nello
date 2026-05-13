'use client'

import { useWizard } from '@/lib/store'
import NavButtons from '@/components/NavButtons'
import { GuideToast } from '@/components/ui/guide-toast'

export default function Screen1Identity() {
  const { bundle, update } = useWizard()

  const ready = bundle.name.trim() && bundle.assistantName.trim() && bundle.occupation.trim() && bundle.bio.trim().length > 20

  return (
    <div className="screen">
      <h2>1. About you</h2>
      <p className="intro">Just the basics. Your assistant fills in the rest by talking to you.</p>

      <div className="row">
        <div className="field">
          <label>Your name</label>
          <input value={bundle.name} onChange={e => update({ name: e.target.value })} placeholder="e.g. Matt" />
        </div>
        <div className="field">
          <label>What should we call your assistant?</label>
          <input value={bundle.assistantName} onChange={e => update({ assistantName: e.target.value })} placeholder="e.g. Luke, Ada, Max" />
        </div>
      </div>

      <div className="field">
        <label>What do you do?</label>
        <input
          value={bundle.occupation}
          onChange={e => update({ occupation: e.target.value })}
          placeholder="I help 7/8 figure companies implement AI without dependency"
        />
      </div>

      <div className="field">
        <label>Tell us about you</label>
        <textarea
          value={bundle.bio}
          onChange={e => update({ bio: e.target.value })}
          rows={5}
          placeholder="2-3 sentences. e.g. I'm a buyer's agent in Brisbane working with first-home buyers. I value direct communication and hate AI cliches. My main tools are GHL and Xero."
        />
        <div className="panel-help">
          This goes verbatim into your assistant&apos;s personality file. Be specific about how you want to be spoken to and what tools / people / projects matter most. You can edit it any time after install.
        </div>
      </div>

      <NavButtons disableNext={!ready} />
      <GuideToast />
    </div>
  )
}
