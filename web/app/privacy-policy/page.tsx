import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy - NELLO Labs',
  description: 'How NELLO Labs collects, uses, shares and deletes your information.',
}

export default function PrivacyPolicy() {
  return (
    <div className="hero">
      <h1>Privacy Policy</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>Effective date: 29 May 2026</p>

      <p style={{ fontSize: 18, color: 'var(--text)' }}>
        This policy explains what information NELLO Labs collects when you use our app,
        why we collect it, who we share it with, and how you can ask us to delete it.
        By using the app you agree to this policy.
      </p>

      <h2 style={{ marginTop: 32 }}>Information we collect</h2>
      <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
        <li>Account details you give us, such as your name and email address.</li>
        <li>
          Information from accounts you choose to connect, including Meta and Facebook
          platform data you authorise us to access.
        </li>
        <li>Usage data, such as the pages you visit and the actions you take in the app.</li>
        <li>Basic device and log data, such as browser type, IP address and timestamps.</li>
      </ul>

      <h2 style={{ marginTop: 32 }}>How we use it</h2>
      <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
        <li>To run the app and provide the features you ask for.</li>
        <li>To respond to you and provide support.</li>
        <li>To keep the service secure and prevent abuse.</li>
        <li>To understand how the app is used so we can improve it.</li>
      </ul>

      <h2 style={{ marginTop: 32 }}>Sharing and third parties</h2>
      <p>
        We do not sell your information. We share it only with service providers who help
        us run the app, and only as needed. This includes the Meta and Facebook platforms
        when you connect those accounts, and analytics and hosting providers. We may also
        disclose information where the law requires it.
      </p>

      <h2 style={{ marginTop: 32 }}>Cookies and tracking</h2>
      <p>
        The app uses cookies and similar tools, including the Meta Pixel, to measure usage
        and improve the service. You can control cookies through your browser settings.
      </p>

      <h2 style={{ marginTop: 32 }}>Data retention</h2>
      <p>
        We keep your information only for as long as we need it to provide the service or
        to meet legal obligations. When we no longer need it, we delete or anonymise it.
      </p>

      <h2 style={{ marginTop: 32 }}>How to request deletion</h2>
      <p>
        You can ask us to delete your information at any time. Email{' '}
        <a href="mailto:matt@nello.gg">matt@nello.gg</a> with the subject line
        &quot;Data deletion request&quot; and the email address linked to your account.
        We will confirm and delete your data within 30 days.
      </p>

      <h2 style={{ marginTop: 32 }}>Contact</h2>
      <p>
        Questions about this policy? Email <a href="mailto:matt@nello.gg">matt@nello.gg</a>.
      </p>

      <h2 style={{ marginTop: 32 }}>Changes to this policy</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        We may update this policy from time to time. We will post the new version on this
        page and update the effective date above.
      </p>
    </div>
  )
}
