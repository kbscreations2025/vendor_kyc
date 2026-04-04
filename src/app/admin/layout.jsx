import { getSession } from '@/lib/auth';
import SidebarNav from '@/components/SidebarNav';

export default async function AdminLayout({ children }) {
  const user = await getSession();

  // If not authenticated, render children without sidebar (login page)
  if (!user) {
    return <>{children}</>;
  }

  // Authenticated: render full admin layout with sidebar
  return (
    <div className="app-layout">
      <SidebarNav user={user} />
      <main className="main-content">{children}</main>
    </div>
  );
}
