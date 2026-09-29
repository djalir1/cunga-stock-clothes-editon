/**
 * Login storage that works whatever time the device shows.
 *
 * Supabase saves when a login expires as a server clock time (expires_at) and then
 * compares it with the device clock. A device whose clock is off (wrong time zone,
 * set by hand, travelling…) then sees every login as already expired, renews it in
 * a loop, and the server ends the session — "logged out a few seconds after login".
 *
 * Here we save expires_at on the device's own clock instead: "valid for as long as the
 * server says, counted from when this device received it". The server still checks the
 * real expiry of every request, so nothing is less secure.
 */

type Json = Record<string, unknown>;

function decodeJwt(token: string): { iat?: number; exp?: number } | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return null;
  }
}

/** Rewrites expires_at to device time when a new access token is stored. */
export function toDeviceTime(value: string, previous: string | null, nowSeconds = Math.floor(Date.now() / 1000)): string {
  let session: Json;
  try { session = JSON.parse(value); } catch { return value; }
  const token = session?.access_token;
  if (typeof token !== 'string' || typeof session.expires_at !== 'number') return value;

  // Same token saved again (e.g. user details updated): keep the expiry we already worked out
  if (previous) {
    try {
      const prev = JSON.parse(previous) as Json;
      if (prev.access_token === token && typeof prev.expires_at === 'number') {
        return JSON.stringify({ ...session, expires_at: prev.expires_at });
      }
    } catch { /* ignore */ }
  }

  const claims = decodeJwt(token);
  const lifetime = claims?.exp && claims?.iat ? claims.exp - claims.iat
    : typeof session.expires_in === 'number' ? session.expires_in : null;
  if (!lifetime) return value;
  return JSON.stringify({ ...session, expires_at: nowSeconds + lifetime });
}

export const authStorage = {
  getItem: (key: string) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string) => {
    try { localStorage.setItem(key, toDeviceTime(value, localStorage.getItem(key))); } catch { /* storage full / private mode */ }
  },
  removeItem: (key: string) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
