'use client';

import { useState, useTransition, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import { useKyc } from '@/context/KycContext';
import Toast, { useToast } from '@/components/Toast';

export default function DashboardClient({ submissions: serverSubmissions, totalLinks }) {
  const router = useRouter();
  const { markAsViewed, updateSubmissionStatus } = useKyc();
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [comment, setComment] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast, showToast, clearToast } = useToast();

  // Optimistic state: instant UI updates before API responds
  const [optimisticSubmissions, applyOptimistic] = useOptimistic(
    serverSubmissions,
    (currentList, { id, status, comment: newComment }) =>
      currentList.map((s) =>
        s.id === id
          ? {
              ...s,
              status,
              comment: newComment || s.comment,
              reviewedAt: new Date().toISOString(),
              viewedAt: s.viewedAt || new Date().toISOString(),
            }
          : s
      )
  );

  const openReview = async (submission) => {
    try {
      if (submission.status === 'pending') {
        applyOptimistic({ id: submission.id, status: 'viewed', comment: '' });
        await markAsViewed(submission.id);
      }
      setSelectedSubmission(submission);
      setComment(submission.comment || '');
    } catch (err) {
      showToast('Failed to open review. Please try again.', 'error');
      router.refresh(); // Re-sync to undo optimistic change
    }
  };

  const handleAction = async (status) => {
    if (!selectedSubmission) return;

    const subId = selectedSubmission.id;
    const currentComment = comment;
    const label = status === 'approved' ? 'Approved' : 'Rejected';

    // Close modal immediately
    setSelectedSubmission(null);
    setComment('');

    // Optimistic update: badge changes instantly
    applyOptimistic({ id: subId, status, comment: currentComment });

    // API call + revalidate server data in background
    startTransition(async () => {
      try {
        await updateSubmissionStatus(subId, status, currentComment);
        showToast(`Submission ${label.toLowerCase()} successfully.`, 'success');
        router.refresh();
      } catch (err) {
        showToast(`Failed to update status: ${err.message}`, 'error');
        router.refresh(); // Re-sync server data to undo optimistic state
      }
    });
  };

  // Stats computed from optimistic data — update instantly
  const pendingCount = optimisticSubmissions.filter((s) => s.status === 'pending' || s.status === 'viewed').length;
  const approvedCount = optimisticSubmissions.filter((s) => s.status === 'approved').length;
  const rejectedCount = optimisticSubmissions.filter((s) => s.status === 'rejected').length;

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalLinks}</div>
          <div className="stat-label">Total Links Generated</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{optimisticSubmissions.length}</div>
          <div className="stat-label">Total Submissions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">Pending Review</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{approvedCount}</div>
          <div className="stat-label">Approved</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rejectedCount}</div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>
            Recent KYC Submissions
            {isPending && <span style={{ fontSize: '13px', color: 'var(--gray-400)', fontWeight: '400', marginLeft: '10px' }}>Updating...</span>}
          </h2>
        </div>
        {optimisticSubmissions.length === 0 ? (
          <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '40px' }}>
            No submissions yet. Generate links and share with vendors to get started.
          </p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Vendor Name</th>
                  <th>PAN</th>
                  <th>Trade Name</th>
                  <th>Submitted At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {optimisticSubmissions.map((s) => (
                  <tr key={s.id} onClick={() => openReview(s)}>
                    <td>{s.vendorName}</td>
                    <td>{s.pan}</td>
                    <td>{s.tradeName || '-'}</td>
                    <td>{new Date(s.submittedAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${s.status}`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedSubmission && (
        <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>KYC Details - {selectedSubmission.vendorName}</h2>
              <button className="btn-icon" onClick={() => setSelectedSubmission(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px' }}>
                <span className={`badge badge-${selectedSubmission.status}`}>
                  {selectedSubmission.status}
                </span>
              </div>

              <h3 style={{ fontSize: '15px', marginBottom: '12px', color: 'var(--gray-700)' }}>
                Basic Information
              </h3>
              <div className="detail-row"><span className="label">Vendor Name</span><span className="value">{selectedSubmission.vendorName}</span></div>
              <div className="detail-row"><span className="label">Legal Name</span><span className="value">{selectedSubmission.legalName || '-'}</span></div>
              <div className="detail-row"><span className="label">Trade Name</span><span className="value">{selectedSubmission.tradeName || '-'}</span></div>
              <div className="detail-row"><span className="label">Address</span><span className="value">{selectedSubmission.address || '-'}</span></div>
              <div className="detail-row"><span className="label">City</span><span className="value">{selectedSubmission.city || '-'}</span></div>
              <div className="detail-row"><span className="label">District</span><span className="value">{selectedSubmission.district || '-'}</span></div>
              <div className="detail-row"><span className="label">PIN Code</span><span className="value">{selectedSubmission.pinCode || '-'}</span></div>
              <div className="detail-row"><span className="label">Activity</span><span className="value">{selectedSubmission.activity || '-'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>
                Contact Details
              </h3>
              <div className="detail-row"><span className="label">Contact Person</span><span className="value">{selectedSubmission.contactPerson || '-'}</span></div>
              <div className="detail-row"><span className="label">Contact No.</span><span className="value">{selectedSubmission.contactNo || '-'}</span></div>
              <div className="detail-row"><span className="label">Email</span><span className="value">{selectedSubmission.contactEmail || '-'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>
                Tax Details
              </h3>
              <div className="detail-row"><span className="label">PAN</span><span className="value">{selectedSubmission.pan}</span></div>
              <div className="detail-row"><span className="label">TAN</span><span className="value">{selectedSubmission.tan || '-'}</span></div>
              <div className="detail-row"><span className="label">GST No.</span><span className="value">{selectedSubmission.gstNo || '-'}</span></div>
              <div className="detail-row"><span className="label">LUT No.</span><span className="value">{selectedSubmission.lutNo || '-'}</span></div>
              <div className="detail-row"><span className="label">Year</span><span className="value">{selectedSubmission.year || '-'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>
                MSME Details
              </h3>
              <div className="detail-row"><span className="label">MSME No.</span><span className="value">{selectedSubmission.msmeNo || '-'}</span></div>
              <div className="detail-row"><span className="label">Category</span><span className="value">{selectedSubmission.msmeCategory || '-'}</span></div>
              <div className="detail-row"><span className="label">URD Letter</span><span className="value">{selectedSubmission.urdLetter ? 'Uploaded' : 'Not Required'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>
                Bank Details
              </h3>
              <div className="detail-row"><span className="label">Bank Name</span><span className="value">{selectedSubmission.bankName || '-'}</span></div>
              <div className="detail-row"><span className="label">Account No.</span><span className="value">{selectedSubmission.bankAccountNo || '-'}</span></div>
              <div className="detail-row"><span className="label">IFSC Code</span><span className="value">{selectedSubmission.ifscCode || '-'}</span></div>

              {selectedSubmission.attachments && selectedSubmission.attachments.length > 0 && (
                <>
                  <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>
                    Attachments ({selectedSubmission.attachments.length})
                  </h3>
                  {selectedSubmission.attachments.map((att, i) => (
                    <div
                      key={i}
                      className="attachment-item clickable"
                      onClick={() => {
                        const url = att.dataUrl || att.fileUrl;
                        if (url) {
                          const w = window.open('', '_blank');
                          if (att.mimeType && att.mimeType.startsWith('image/')) {
                            w.document.write(`<html><head><title>${att.renamedName}</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5"><img src="${url}" style="max-width:100%;max-height:100vh" /></body></html>`);
                          } else if (att.mimeType === 'application/pdf') {
                            w.document.write(`<html><head><title>${att.renamedName}</title></head><body style="margin:0"><iframe src="${url}" style="width:100%;height:100vh;border:none"></iframe></body></html>`);
                          } else {
                            w.document.write(`<html><head><title>${att.renamedName}</title></head><body><p>Download: <a href="${url}" download="${att.renamedName}">${att.renamedName}</a></p></body></html>`);
                          }
                          w.document.close();
                        }
                      }}
                    >
                      <div className="file-info">
                        <span>📎</span>
                        <div>
                          <span><strong>{att.renamedName}</strong></span>
                          <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{att.type} | {(att.size / 1024).toFixed(1)} KB</div>
                        </div>
                      </div>
                      <button className="view-btn" onClick={(e) => e.stopPropagation()}>View</button>
                    </div>
                  ))}
                </>
              )}

              <div className="form-group" style={{ marginTop: '20px' }}>
                <label>Admin Comment</label>
                <textarea
                  className="form-control"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment about this submission..."
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={() => handleAction('rejected')}>
                Reject
              </button>
              <button className="btn btn-success" onClick={() => handleAction('approved')}>
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
