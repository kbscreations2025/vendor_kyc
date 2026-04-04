/**
 * Supabase SSR Client Helpers
 *
 * Creates Supabase clients that work with Next.js cookies for auth.
 * - createServerClient: For server components, route handlers, server actions
 * - createProxyClient: For proxy.js (uses request/response cookies)
 */

import { createServerClient as _createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Create a Supabase client for Server Components, Route Handlers, Server Actions.
 * Reads/writes auth cookies automatically via next/headers.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return _createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll can fail in Server Components (read-only).
          // This is fine — auth cookies refresh in Route Handlers/Server Actions.
        }
      },
    },
  });
}

/**
 * Create a Supabase client for proxy.js (middleware replacement).
 * Uses NextRequest/NextResponse cookies directly.
 */
export function createProxySupabase(request, response) {
  return _createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
