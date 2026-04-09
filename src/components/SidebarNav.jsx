'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { href: '/admin/dashboard', icon: '\uD83D\uDCCA', label: 'Dashboard' },
  { href: '/admin/generate-link', icon: '\uD83D\uDD17', label: 'Generate Links' },
  { href: '/admin/review', icon: '\uD83D\uDCCB', label: 'Review KYC' },
];

export default function SidebarNav({ user }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch {
      // Force redirect even if fetch fails
      window.location.href = '/admin/login';
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Image
          src="/LogoSys1.jpg"
          alt="KBS Logo"
          width={160}
          height={48}
          style={{ objectFit: 'contain' }}
        />
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? 'active' : ''}
          >
            <span>{item.icon}</span> {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--gray-200)' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: 'none',
            border: '1px solid var(--gray-300)',
            borderRadius: 'var(--radius)',
            color: 'var(--gray-600)',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--danger)';
            e.currentTarget.style.color = 'var(--danger)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--gray-300)';
            e.currentTarget.style.color = 'var(--gray-600)';
          }}
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
