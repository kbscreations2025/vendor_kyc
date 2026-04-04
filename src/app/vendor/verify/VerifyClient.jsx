'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { validatePAN } from '@/lib/encryption';

export default function VerifyClient({ tokenData, token }) {
  const router = useRouter();
  const [panInput, setPanInput] = useState('');
  const [error, setError] = useState('');

  const handleVerify = () => {
    setError('');
    const pan = panInput.toUpperCase().trim();

    if (!pan) {
      setError('Please enter your PAN number');
      return;
    }
    if (!validatePAN(pan)) {
      setError('Invalid PAN format. Expected format: ABCDE1234F');
      return;
    }
    if (pan !== tokenData.pan) {
      setError('PAN number does not match. Access denied.');
      return;
    }

    router.push(`/vendor/form?token=${token}`);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔐</div>
          <h1 style={{ fontSize: '22px', fontWeight: '700' }}>KBS - Vendor KYC Verification</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px', marginTop: '8px' }}>
            Please enter your PAN number to verify your identity and access the KYC form.
          </p>
        </div>

        <div style={{ marginBottom: '8px', fontSize: '13px', color: 'var(--gray-500)' }}>
          Link expires: {new Date(tokenData.expiresAt).toLocaleString()}
        </div>

        <div className="form-group">
          <label>PAN Number <span className="required">*</span></label>
          <input
            className={`form-control ${error ? 'error' : ''}`}
            value={panInput}
            onChange={(e) => setPanInput(e.target.value.toUpperCase())}
            placeholder="Enter your PAN number (e.g. ABCDE1234F)"
            maxLength={10}
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
          />
          {error && <p className="error-text">{error}</p>}
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
          onClick={handleVerify}
        >
          Verify & Access Form
        </button>
      </div>
    </div>
  );
}
