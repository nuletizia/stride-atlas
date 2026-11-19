// Site-wide constants shared by the legal/support pages and footers.
// Safe to import from server and client code (no env, no fs).

// Where users reach a human for support, privacy and deletion requests.
// Strava's API Policy (2.4, 2.5) requires a working, easy-to-find contact.
export const SUPPORT_EMAIL = 'na@letizia.tech';

// Named as the data controller on /privacy and the operator on /terms.
export const OPERATOR_NAME = 'Nunzio Alexandro Letizia';

export const SITE_URL = 'https://stride.letizia.tech';

// Stride Atlas is open source. Linked from the landing nav, every footer
// and the support FAQ.
export const REPO_URL = 'https://github.com/nuletizia/stride-atlas';

// Shown as "Last updated" on /privacy and /terms. Bump when either changes.
export const LEGAL_UPDATED = 'November 2026';

export const STRAVA_APPS_SETTINGS = 'https://www.strava.com/settings/apps';

export function stravaActivityUrl(id) {
  return `https://www.strava.com/activities/${id}`;
}

export function stravaAthleteUrl(id) {
  return `https://www.strava.com/athletes/${id}`;
}
