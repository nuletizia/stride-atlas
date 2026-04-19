// POST /api/auth/logout — clear the session.
// (GET is also accepted for easy testing via browser nav.)

import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle() {
  await clearSession();
  const base = process.env.PUBLIC_APP_URL || '/';
  return NextResponse.redirect(base);
}

export const GET = handle;
export const POST = handle;
