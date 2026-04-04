import { fetchSubmissions } from '@/lib/api';
import ReviewClient from './ReviewClient';

export default async function ReviewPage() {
  let submissions = [];
  let fetchError = null;

  try {
    submissions = await fetchSubmissions();
  } catch (err) {
    fetchError = err.message;
  }

  if (fetchError) {
    return (
      <>
        <div className="page-header" style={{ position: 'static', marginTop: 0, paddingTop: 0 }}>
          <h1>Review KYC Submissions</h1>
          <p>Review, approve, or reject vendor KYC submissions</p>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <h3 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Failed to Load Submissions</h3>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px', marginBottom: '16px' }}>{fetchError}</p>
          <p style={{ color: 'var(--gray-500)', fontSize: '13px' }}>Please check your database connection and refresh the page.</p>
        </div>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <div className="page-header" style={{ position: 'static', marginTop: 0, paddingTop: 0, flexShrink: 0 }}>
        <h1>Review KYC Submissions</h1>
        <p>Review, approve, or reject vendor KYC submissions</p>
      </div>

      <ReviewClient submissions={submissions} />
    </div>
  );
}
