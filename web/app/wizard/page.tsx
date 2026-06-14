import Screen0Intro from '@/components/screens/Screen0Intro'

// The wizard collapsed from a 4-screen form (identity / connections / build)
// to a single "watch + copy one prompt" page. All data collection now happens
// conversationally inside Claude Code, driven by INSTALL_GUIDE.md in the repo.
export default function WizardPage() {
  return (
    <div className="wizard">
      <main>
        <Screen0Intro />
      </main>
    </div>
  )
}
