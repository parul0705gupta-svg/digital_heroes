// Supabase handles login sessions; every data call goes to the server API with the user's JWT.
import { createClient } from '@supabase/supabase-js';
const env = import.meta.env;
if (env.PROD && !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY && env.VITE_API_URL)) throw new Error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or VITE_API_URL');
export const sb = createClient(env.VITE_SUPABASE_URL || 'http://localhost', env.VITE_SUPABASE_ANON_KEY || 'anon');
const BASE = env.VITE_API_URL || '';
export async function api(path, method = 'GET', body) {
  const { data } = await sb.auth.getSession();
  let r;
  try {
    r = await fetch(`${BASE}/api${path}`, { method, body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(data.session && { Authorization: `Bearer ${data.session.access_token}` }) } });
  } catch { throw new Error('Cannot reach the server. Check your connection and try again.'); }
  let j = {}; try { j = await r.json(); } catch { /* non-JSON error page */ }
  if (r.status === 401 && data.session) { await sb.auth.signOut(); throw new Error('Your session expired. Please log in again.'); }
  if (!r.ok) throw new Error(j.error || 'The server returned an error. Please try again.');
  return j;
}
