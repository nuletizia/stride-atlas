import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { SUPPORT_EMAIL, OPERATOR_NAME, LEGAL_UPDATED, STRAVA_APPS_SETTINGS } from '@/lib/site';

export const metadata = {
  title: 'Terms',
  description: 'The terms for using Stride Atlas.',
};

// Strava API Policy 9.1 / 9.2: our terms must not conflict with Strava's,
// and must disclaim warranties and liability on behalf of third-party
// service providers (Strava included). Keep that section intact.
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated={LEGAL_UPDATED}
      lede="Short version: Stride Atlas is a free tool that shows you your own running data. Use it as a guide, not as medical or coaching advice."
    >
      <h2>Who we are</h2>
      <p>
        Stride Atlas (“the app”) is run by {OPERATOR_NAME} as an independent
        project. Contact: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>Not affiliated with Strava</h2>
      <p>
        Stride Atlas uses the Strava API but is not developed, endorsed, sponsored or
        approved by Strava. Strava and the Strava logo are trademarks of Strava, Inc. Your
        use of Strava itself is governed by{' '}
        <a href="https://www.strava.com/legal/terms" target="_blank" rel="noreferrer">
          Strava’s Terms of Service
        </a>{' '}
        and{' '}
        <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
        . Nothing in these terms changes or overrides them.
      </p>

      <h2>Using the app</h2>
      <ul>
        <li>The app is free. There are no paid features and no ads.</li>
        <li>
          You connect your own Strava account and see only your own data. You can disconnect
          at any time from the dashboard or from{' '}
          <a href={STRAVA_APPS_SETTINGS} target="_blank" rel="noreferrer">
            your Strava app settings
          </a>
          .
        </li>
        <li>
          Don’t try to access other people’s data, overload the service, or use it
          to break the law or Strava’s terms.
        </li>
        <li>
          How we handle your data is described in the{' '}
          <Link href="/privacy">privacy policy</Link>.
        </li>
      </ul>

      <h2>Not medical or coaching advice</h2>
      <p>
        Workout types, efficiency scores, trends and comparisons are estimates computed from
        your recorded data. They can be wrong. Don’t rely on them for medical,
        health or training-safety decisions.
      </p>

      <h2>No warranty</h2>
      <p>
        The app is provided “as is” and “as available”, without
        warranties of any kind. To the fullest extent permitted by law, Stride Atlas{' '}
        <b>and its third-party service providers, including Strava, Inc.</b> disclaim all
        warranties, express or implied, including the implied warranties of merchantability,
        fitness for a particular purpose and non-infringement. The app may change, break or
        be discontinued at any time, including if access to the Strava API changes.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, neither Stride Atlas <b>nor its third-party
        service providers, including Strava, Inc.</b>, will be liable for any indirect,
        incidental, special, consequential or punitive damages, or any loss of data, arising
        from your use of or inability to use the app. Nothing here limits liability that
        cannot be limited under applicable law.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change, the date at the top of this page changes too. Continuing to
        use the app after that means you accept the updated terms.
      </p>
    </LegalPage>
  );
}
