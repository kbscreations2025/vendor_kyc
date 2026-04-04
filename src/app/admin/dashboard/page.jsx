import { fetchLinks, fetchSubmissions } from '@/lib/api';
import DashboardClient from './DashboardClient';

export default async function Dashboard() {
  let links = [];
  let submissions = [];
  let fetchError = null;

  try {
    [links, submissions] = await Promise.all([
      fetchLinks(),
      fetchSubmissions(),
    ]);
  } catch (err) {
    fetchError = err.message;
  }

  if (fetchError) {
    return (
      <>
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Overview of vendor KYC submissions and link status</p>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
          <h3 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Failed to Load Data</h3>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px', marginBottom: '16px' }}>{fetchError}</p>
          <p style={{ color: 'var(--gray-500)', fontSize: '13px' }}>Please check your database connection and refresh the page.</p>
        </div>
      </>
    );
  }

  const recentSubmissions = [...submissions].sort(
    (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)
  );

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of vendor KYC submissions and link status</p>
      </div>

      <DashboardClient
        submissions={recentSubmissions}
        totalLinks={links.length}
      />
    </>
  );
}
