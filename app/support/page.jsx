import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { SUPPORT_EMAIL, STRAVA_APPS_SETTINGS, REPO_URL } from '@/lib/site';

export const metadata = {
  title: 'Support',
  description: 'Help with Stride Atlas: connecting Strava, missing runs, disconnecting and deleting your data.',
};

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      lede="Stride Atlas is a small, free project. If something looks wrong or you need help, a real person reads every email."
    >
      <h2>Contact</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Include what you
        were looking at and, if it’s about a specific run, its date. Expect a reply
        within a few days.
      </p>

      <h2>Common questions</h2>
      <h3>Some of my runs are missing</h3>
      <p>
        Stride Atlas shows activities Strava labels as runs. Treadmill runs are included;
        walks, hikes and rides are not. Data is refreshed at most once an hour, so a run you
        just uploaded can take up to an hour to appear.
      </p>
      <h3>Why does a run show a different workout type than I expected?</h3>
      <p>
        Workout types (Easy, Moderate, Hard, Long, Race, Recovery) are inferred from heart
        rate, pace and distance. Setting your own HR max in the View panel changes how runs
        are classified.
      </p>
      <h3>I deleted or edited a run on Strava</h3>
      <p>
        The change shows up the next time your data refreshes, within an hour at most.
      </p>
      <h3>How do I disconnect and delete my data?</h3>
      <p>
        Press <b>Disconnect</b> at the top of your dashboard. That revokes Stride
        Atlas’s access at Strava, deletes your cached activities and session, and
        shows a confirmation. You can also revoke access from{' '}
        <a href={STRAVA_APPS_SETTINGS} target="_blank" rel="noreferrer">
          your Strava app settings
        </a>
        . Details are in the <Link href="/privacy">privacy policy</Link>.
      </p>
      <h3>Can I see my data on Strava?</h3>
      <p>
        Yes. Every expanded run card has a <b>View on Strava</b> link to the original
        activity, and your name at the top of the dashboard links to your Strava profile.
      </p>
      <h3>Is Stride Atlas open source?</h3>
      <p>
        Yes. The code is on{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a> under the MIT license.
        You can read exactly how your data is handled, report bugs as issues, or run your own
        copy.
      </p>
    </LegalPage>
  );
}
