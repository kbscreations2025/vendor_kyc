/**
 * Auth Utility - Uses Supabase Auth
 *
 * Admin users are managed in Supabase Dashboard → Authentication → Users.
 * Sessions are handled automatically by Supabase (JWT tokens in httpOnly cookies).
 */

import { createServerSupabase } from './supabase-server';

/**
 * Sign in with email and password via Supabase Auth.
 * Call from Route Handler only (needs cookie write access).
 *
 * @returns {{ user, error }} - user object on success, error message on failure
 */
export async function signIn(email, password) {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { user: null, error: error.message };
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || data.user.email.split('@')[0],
    },
    error: null,
  };
}

/**
 * Sign out and clear the session.
 * Call from Route Handler only (needs cookie write access).
 */
export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
}

/**
 * Get the current session from cookies (server-side).
 * Works in Server Components, Route Handlers, Server Actions.
 *
 * @returns {{ email, name } | null}
 */
export async function getSession() {
  const supabase = await createServerSupabase();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || user.email.split('@')[0],
  };
}
