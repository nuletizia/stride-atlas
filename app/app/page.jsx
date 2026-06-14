import { redirect } from 'next/navigation';
import { getSession, isLoggedIn } from '@/lib/session';
import UserDashboardLoader from '@/components/UserDashboardLoader';

export const metadata = {
  title: 'Dashboard · Stride Atlas',
  description: 'Your Strava runs, annotated.',
};

// This page only gates auth. Data loading happens client-side via
// `/api/runs`, because Server Components can't refresh + persist Strava
// tokens (they can't mutate cookies). Fetching here would force a reconnect
// every ~6 h when the access token expires; `/api/runs` refreshes it and
// keeps the user logged in for the full 30-day session. See
// components/UserDashboardLoader.jsx.
export default async function AppPage() {
  const session = await getSession();

  // Unauthed visitors are redirected to the landing page, per the
  // agreed-upon routing: / is always landing, /app is always dashboard.
  if (!isLoggedIn(session)) redirect('/');

  return <UserDashboardLoader athleteName={session.athleteName} />;
}
