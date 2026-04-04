import { NextResponse } from 'next/server';
import { createProxySupabase } from '@/lib/supabase-server';

export async function proxy(request) {
  const path = request.nextUrl.pathname;

  // Only protect /admin/* routes (except /admin/login and /api/auth/*)
  const isAdminRoute = path.startsWith('/admin');
  const isLoginPage = path === '/admin/login';
  const isAuthApi = path.startsWith('/api/auth');

  if (!isAdminRoute || isAuthApi) {
    return NextResponse.next();
  }

  // Create a response we can modify (for cookie refresh)
  const response = NextResponse.next();

  // Check Supabase session from cookies
  const supabase = createProxySupabase(request, response);
  const { data: { user } } = await supabase.auth.getUser();

  // If on login page and already authenticated → redirect to dashboard
  if (isLoginPage && user) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  // If on any admin page (not login) and NOT authenticated → redirect to login
  if (!isLoginPage && !user) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
