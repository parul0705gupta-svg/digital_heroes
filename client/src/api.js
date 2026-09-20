// Supabase & JWT Authentication service for Digital Heroes
import { createClient } from '@supabase/supabase-js';

const env = import.meta.env;
if (env.PROD && !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY && env.VITE_API_URL)) {
  throw new Error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or VITE_API_URL');
}

export const sb = createClient(env.VITE_SUPABASE_URL || 'http://localhost', env.VITE_SUPABASE_ANON_KEY || 'anon');
const BASE = env.VITE_API_URL || '';

const TOKEN_KEY = 'dh_jwt';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (tok) => {
  if (tok) localStorage.setItem(TOKEN_KEY, tok);
  else localStorage.removeItem(TOKEN_KEY);
  notifyAuth();
};
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  notifyAuth();
};

const listeners = new Set();
export const onAuthChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notifyAuth = () => {
  const tok = getToken();
  listeners.forEach(fn => {
    try { fn(tok); } catch (e) { console.error(e); }
  });
};

export async function login(email, password) {
  const data = await api('/login', 'POST', { email, password });
  if (data.token) {
    setToken(data.token);
  }
  try {
    await sb.auth.signInWithPassword({ email, password });
  } catch (_) {
    // fallback if supabase client is offline
  }
  return data;
}

export async function signup({ email, password, full_name, charity_id }) {
  const data = await api('/signup', 'POST', { email, password, full_name, charity_id });
  if (data.token) {
    setToken(data.token);
  }
  try {
    await sb.auth.signInWithPassword({ email, password });
  } catch (_) {
    // fallback if supabase client is offline
  }
  return data;
}

export async function logout() {
  clearToken();
  try {
    await sb.auth.signOut();
  } catch (_) {}
}

export async function getCurrentUser() {
  let token = getToken();
  if (!token) {
    try {
      const { data } = await sb.auth.getSession();
      if (data?.session?.access_token) {
        token = data.session.access_token;
        localStorage.setItem(TOKEN_KEY, token);
      }
    } catch (_) {}
  }
  if (!token) return null;
  try {
    return await api('/me');
  } catch (_) {
    clearToken();
    return null;
  }
}

export async function api(path, method = 'GET', body) {
  let token = getToken();
  if (!token) {
    try {
      const { data } = await sb.auth.getSession();
      if (data?.session?.access_token) {
        token = data.session.access_token;
        localStorage.setItem(TOKEN_KEY, token);
      }
    } catch (_) {}
  }

  let r;
  try {
    r = await fetch(`${BASE}/api${path}`, {
      method,
      body: body && JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }

  let j = {};
  try { j = await r.json(); } catch { /* non-JSON response */ }

  if (r.status === 401 && token) {
    await logout();
    throw new Error('Your session expired. Please log in again.');
  }

  if (!r.ok) throw new Error(j.error || 'The server returned an error. Please try again.');
  return j;
}
