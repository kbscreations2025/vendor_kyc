import { decryptAndValidateToken } from '@/lib/encryption';
import VerifyClient from './VerifyClient';

export default async function VerifyPage({ searchParams }) {
  const params = await searchParams;
  const token = params?.token || '';

  // Validate token server-side (no JS needed for error cases)
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
        <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>🚫</div>
          <h1 style={{ fontSize: '22px', marginBottom: '10px', color: 'var(--danger)' }}>Access Denied</h1>
          <p style={{ color: 'var(--gray-700)', fontSize: '15px', marginBottom: '12px' }}>
            No verification token found. Please use the link provided by the admin.
          </p>
          <div style={{ padding: '16px', background: 'var(--danger-light)', borderRadius: 'var(--radius)', border: '1px solid var(--danger)', marginTop: '8px' }}>
            <p style={{ fontSize: '14px', color: 'var(--gray-800)' }}>
              The link you are trying to access is invalid or has been tampered with. Please contact the KBS admin for a valid KYC link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const result = decryptAndValidateToken(token);

  if (!result.valid) {
    if (result.expired) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>⏰</div>
            <h1 style={{ fontSize: '22px', marginBottom: '10px', color: 'var(--warning)' }}>Link Expired</h1>
            <p style={{ color: 'var(--gray-700)', fontSize: '15px', marginBottom: '12px' }}>
              This KYC verification link has expired and is no longer valid.
            </p>
            {result.expiresAt && (
              <p style={{ color: 'var(--gray-500)', fontSize: '13px', marginBottom: '16px' }}>
                Expired on: <strong>{new Date(result.expiresAt).toLocaleString()}</strong>
              </p>
            )}
            <div style={{ padding: '16px', background: 'var(--warning-light)', borderRadius: 'var(--radius)', border: '1px solid var(--warning)', marginTop: '8px' }}>
              <p style={{ fontSize: '14px', color: 'var(--gray-800)' }}>
                KYC links are valid for <strong>4 days</strong> from the date of creation. Please contact the KBS admin to generate a new link for your PAN number.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
        <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>🚫</div>
          <h1 style={{ fontSize: '22px', marginBottom: '10px', color: 'var(--danger)' }}>Access Denied</h1>
          <p style={{ color: 'var(--gray-700)', fontSize: '15px', marginBottom: '12px' }}>
            {result.error}
          </p>
          <div style={{ padding: '16px', background: 'var(--danger-light)', borderRadius: 'var(--radius)', border: '1px solid var(--danger)', marginTop: '8px' }}>
            <p style={{ fontSize: '14px', color: 'var(--gray-800)' }}>
              The link you are trying to access is invalid or has been tampered with. Please contact the KBS admin for a valid KYC link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Token is valid - render the client form for PAN verification
  return <VerifyClient tokenData={result} token={token} />;
}
