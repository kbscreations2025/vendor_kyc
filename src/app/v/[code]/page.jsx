import { redirect } from 'next/navigation';
import { findLinkByShortCode } from '@/lib/api';

export default async function ShortLinkRedirect({ params }) {
  const { code } = await params;

  if (!code) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Invalid link.</p>
      </div>
    );
  }

  const fullLink = await findLinkByShortCode(code);

  if (!fullLink) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚫</div>
          <h1 style={{ fontSize: '20px', color: 'var(--danger)', marginBottom: '8px' }}>Link Not Found</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px' }}>
            This KYC link is invalid or has been removed. Please contact the KBS admin.
          </p>
        </div>
      </div>
    );
  }

  // fullLink is like /vendor/verify?token=xyz — redirect to it
  redirect(fullLink);
}
