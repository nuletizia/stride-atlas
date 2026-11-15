import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { SUPPORT_EMAIL, OPERATOR_NAME, LEGAL_UPDATED, STRAVA_APPS_SETTINGS } from '@/lib/site';

export const metadata = {
  title: 'Privacy',
  description: 'What Stride Atlas stores, where, and for how long.',
};

// Plain-English privacy policy reflecting how the app actually handles
// data: no server DB for activities, in-memory cache only, localStorage
// for client-side preferences, encrypted session cookie for Strava tokens.
// It also covers what Strava's API Policy (June 2026) requires: data types,
// collection method, withdrawing consent, deletion + written confirmation,
// GDPR basics, and the Strava usage-data statement (6.5).
// Keep the copy honest and specific. If behaviour changes, update here.
export default function PrivacyPage() {
  const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
  return (
    <LegalPage
      title="Privacy"
      updated={LEGAL_UPDATED}
      lede="Stride Atlas is a personal dashboard for your Strava runs. There's no database of activities on our side, no email list, and no sharing beyond what's strictly needed to make the app work. This page spells out exactly what that means."
    >
      <h2>Who is responsible</h2>
      <p>
        Stride Atlas is run by {OPERATOR_NAME}, who is the data controller for the personal
        data described here. Contact: {mail}.
      </p>

      <h2>What we collect, and how</h2>
      <p>
        Nothing is collected until you click <b>Connect with Strava</b> and approve access on
        Strava’s own consent screen. We ask for two Strava permissions:
      </p>
      <ul>
        <li>
          <code>read</code>: your public profile (name, city, athlete ID).
        </li>
        <li>
          <code>activity:read_all</code>: your activities, including ones set to
          “Only You”, so your private runs appear in your own dashboard. Only you
          ever see them.
        </li>
      </ul>
      <p>
        With that access, our server reads your activity summaries from the Strava API. From
        each run we use the date, distance, moving and elapsed time, heart rate, elevation,
        temperature, Relative Effort, start location (to group runs on the same route),
        activity name, recording device, and race or long-run flags. Strava also gives us an
        access token and a refresh token so we can read this data on your behalf.
      </p>
      <p>We do <b>not</b> collect:</p>
      <ul>
        <li>Your email address (Strava doesn’t share it with us, and we don’t ask).</li>
        <li>GPS traces or maps (we read summaries only).</li>
        <li>Any activity other than runs, beyond filtering them out.</li>
        <li>Anything you do on the site beyond the setting choices you make in the View panel.</li>
      </ul>

      <h2>Why we use it</h2>
      <p>
        Only to show you your own dashboard. The legal basis is your consent, given on
        Strava’s authorization screen, which you can withdraw at any time. Your Strava
        data is never shown to anyone else, never sold or shared, never used for advertising,
        never used for analytics about you or our users, and never used to train or run any AI
        model.
      </p>

      <h2>Where it’s stored, and for how long</h2>
      <ul>
        <li>
          <b>Tokens</b> live in an encrypted session cookie (<code>stride_session</code>) in
          your browser. It’s HTTP-only, SameSite=Lax and Secure, and expires after 30
          days of inactivity. We don’t have a database of users.
        </li>
        <li>
          <b>Activities</b> are fetched from Strava when you open the dashboard and held in a
          per-athlete server memory cache for <b>at most one hour</b>. Server restarts wipe it
          sooner. Changes or deletions you make on Strava show up within that hour.
        </li>
        <li>
          <b>Preferences</b> (theme, units, time range, HR max override) live in your
          browser’s localStorage and never leave your device.
        </li>
      </ul>

      <h2>Third parties</h2>
      <ul>
        <li>
          <b>Strava</b> is the source of your data and handles sign-in through OAuth. Strava
          may collect usage data about how Stride Atlas uses the Strava API and use it for its
          own business purposes, as described in{' '}
          <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noreferrer">
            Strava’s Privacy Policy
          </a>
          , which governs Strava’s own processing and controls if it conflicts with this
          page.
        </li>
        <li>
          <b>Vercel</b> hosts the app. It keeps standard request
          logs (IP address, time, URL) under its own policy; we don’t read or keep them.
          Vercel Analytics records anonymous page views (page path, country, referrer) with no
          cookies and no Strava data.
        </li>
      </ul>
      <p>That’s the complete list. No ad networks, marketing pixels or session replay.</p>

      <h2>Cookies</h2>
      <p>
        One cookie: <code>stride_session</code>, used only to keep you signed in. No tracking
        cookies.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <b>Withdraw consent / disconnect.</b> Press <b>Disconnect</b> on your dashboard. We
          revoke our access at Strava, delete your cached activities and your session, and show
          you a page confirming it. You can also revoke Stride Atlas from{' '}
          <a href={STRAVA_APPS_SETTINGS} target="_blank" rel="noreferrer">
            your Strava app settings
          </a>
          ; our cached copy then expires within an hour.
        </li>
        <li>
          <b>Deletion.</b> Disconnecting deletes everything we hold about you. You can also
          email {mail} to ask for deletion, and we’ll confirm in writing once it’s
          done, within 30 days at most.
        </li>
        <li>
          <b>Access.</b> Your dashboard shows all the data we use. Email us for a copy, or use
          Strava’s own bulk export (<i>Settings → My Account → Download or Delete Your
          Account</i>).
        </li>
        <li>
          <b>Other rights.</b> Under the GDPR and UK GDPR you can also ask us to correct or
          restrict processing of your data, or object to it, and you can complain to your
          local data protection authority.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        All traffic uses HTTPS. Tokens are encrypted at rest in the cookie and never sent to
        your browser’s JavaScript. If a security incident ever affects your data, we will
        tell affected users and Strava promptly.
      </p>

      <h2>Children</h2>
      <p>Stride Atlas isn’t directed at children under 13, in line with Strava’s own terms.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that affects what we collect or how we use it, the
        date above changes and we’ll ask for your consent again if the data we collect
        changes.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, or something here that doesn’t match what you’re seeing? Email{' '}
        {mail}. See also the <Link href="/support">support page</Link> and the{' '}
        <Link href="/terms">terms</Link>.
      </p>
    </LegalPage>
  );
}
