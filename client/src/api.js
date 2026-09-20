// Supabase handles login sessions; every data call goes to the server API with the user's JWT.
import { createClient } from '@supabase/supabase-js';
export const sb = createClient(import.meta.env.VITE_SUPABASE_URL || 'http://localhost', import.meta.env.VITE_SUPABASE_ANON_KEY || 'anon');
const BASE = import.meta.env.VITE_API_URL || '';
export async function api(path, method = 'GET', body) {
  const { data } = await sb.auth.getSession();
  const r = await fetch(`${BASE}/api${path}`, { method, body: body && JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(data.session && { Authorization: `Bearer ${data.session.access_token}` }) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
