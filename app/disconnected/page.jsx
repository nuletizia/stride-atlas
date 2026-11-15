import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { SUPPORT_EMAIL, STRAVA_APPS_SETTINGS } from '@/lib/site';

export const metadata = {
  title: 'Disconnected',
  robots: { index: false },
};

// Landing spot after Disconnect (/api/auth/logout). This page is the
// written deletion confirmation required by Strava's API Policy 2.5 / 7.4.
export default async function DisconnectedPage({ searchParams }) {
  const params = await searchParams;
  const revoked = params?.revoked !== '0';

  return (
    <LegalPage
      title="You're disconnected"
      lede="Stride Atlas no longer has access to your Strava account, and your data has been deleted from our side."
    >
      <h2>What we did</h2>
      <ul>
        {revoked ? (
          <li>
            <b>Revoked access at Strava.</b> Every token Strava issued to Stride Atlas for
            your account is now invalid. The app can&rsquo;t read your activities again unless
            you reconnect.
          </li>
        ) : (
          <li>
            <b>Strava access.</b>{' '}Strava didn&rsquo;t confirm the revocation, most likely
            because access was already revoked or had expired. To be sure, check{' '}
            <a href={STRAVA_APPS_SETTINGS} target="_blank" rel="noreferrer">
              your Strava app settings
            </a>{' '}
            and revoke Stride Atlas if it&rsquo;s still listed.
          </li>
        )}
        <li>
          <b>Deleted your cached activities.</b> The temporary copy of your runs held in
          server memory was removed.
        </li>
        <li>
          <b>Deleted your session.</b> The encrypted cookie that held your Strava tokens
          was cleared from this browser.
        </li>
      </ul>
      <p>
        We don&rsquo;t keep a database of users or activities, so nothing else about you
        remains on our side. Display preferences (theme, units, HR max) are stored only in
        this browser&rsquo;s localStorage; clear this site&rsquo;s data in your browser to
        remove them too.
      </p>
      <p>
        Want a confirmation by email, or have a question? Write to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. You can reconnect any time
        from the <Link href="/">home page</Link>.
      </p>
    </LegalPage>
  );
}
