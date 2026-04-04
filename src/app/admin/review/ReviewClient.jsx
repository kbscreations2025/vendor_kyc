'use client';

import { useState, useTransition, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import { useKyc } from '@/context/KycContext';
import Toast, { useToast } from '@/components/Toast';
import * as XLSX from 'xlsx';

export default function ReviewClient({ submissions: serverSubmissions }) {
  const router = useRouter();
  const { markAsViewed, updateSubmissionStatus } = useKyc();
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [comment, setComment] = useState('');
  const [filter, setFilter] = useState('all');
  const [viewingDoc, setViewingDoc] = useState(null);
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

  const filtered = optimisticSubmissions.filter((s) => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)
  );

  const openReview = async (submission) => {
    try {
      if (submission.status === 'pending') {
        applyOptimistic({ id: submission.id, status: 'viewed', comment: '' });
        await markAsViewed(submission.id);
        setSelectedSubmission({ ...submission, status: 'viewed' });
      } else {
        setSelectedSubmission(submission);
      }
      setComment(submission.comment || '');
    } catch (err) {
      showToast('Failed to open review. Please try again.', 'error');
      router.refresh();
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

    // Optimistic update: badge changes instantly in table
    applyOptimistic({ id: subId, status, comment: currentComment });

    // API call + revalidate server data in background
    startTransition(async () => {
      try {
        await updateSubmissionStatus(subId, status, currentComment);
        showToast(`Submission ${label.toLowerCase()} successfully.`, 'success');
        router.refresh();
      } catch (err) {
        showToast(`Failed to update status: ${err.message}`, 'error');
        router.refresh(); // Re-sync to undo optimistic state
      }
    });
  };

  const openDocument = (att) => {
    setViewingDoc(att);
  };

  const isImage = (mimeType) => {
    return mimeType && mimeType.startsWith('image/');
  };

  const isPdf = (mimeType) => {
    return mimeType && mimeType === 'application/pdf';
  };

  const exportToExcel = () => {
    if (sorted.length === 0) return;

    try {
    const exportData = sorted.map((s, index) => ({
      'Sr. No.': index + 1,
      'Vendor Name': s.vendorName || '',
      'Legal Name': s.legalName || '',
      'Trade Name': s.tradeName || '',
      'Address': s.address || '',
      'City': s.city || '',
      'District': s.district || '',
      'PIN Code': s.pinCode || '',
      'Activity': s.activity || '',
      'Contact Person': s.contactPerson || '',
      'Contact No.': s.contactNo || '',
      'Contact Email': s.contactEmail || '',
      'PAN': s.pan || '',
      'TAN': s.tan || '',
      'GST No.': s.gstNo || '',
      'GST Not Registered': s.gstNotRegistered ? 'Yes' : 'No',
      'LUT No.': s.lutNo || '',
      'Year': s.year || '',
      'MSME No.': s.msmeNo || '',
      'MSME Category': s.msmeCategory || '',
      'Bank Name': s.bankName || '',
      'Bank A/c No.': s.bankAccountNo || '',
      'IFSC Code': s.ifscCode || '',
      'Attachments': (s.attachments || []).map((a) => a.renamedName).join(', '),
      'Submitted At': s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '',
      'Status': s.status || '',
      'Admin Comment': s.comment || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const colWidths = Object.keys(exportData[0]).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...exportData.map((row) => String(row[key] || '').length)
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    const filterLabel = filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1);
    XLSX.utils.book_append_sheet(wb, ws, `KYC_${filterLabel}`);

    const fileName = `KBS_Vendor_KYC_${filterLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast('Excel exported successfully.', 'success');
    } catch (err) {
      showToast('Failed to export Excel. Please try again.', 'error');
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>
            Submissions ({filtered.length})
            {isPending && <span style={{ fontSize: '13px', color: 'var(--gray-400)', fontWeight: '400', marginLeft: '10px' }}>Updating...</span>}
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {['all', 'pending', 'viewed', 'approved', 'rejected'].map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <div style={{ width: '1px', height: '24px', background: 'var(--gray-300)', margin: '0 4px' }} />
            <button
              className="btn btn-sm btn-success"
              onClick={exportToExcel}
              disabled={sorted.length === 0}
              title={`Export ${filter === 'all' ? 'all' : filter} submissions to Excel`}
            >
              Export Excel
            </button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '40px' }}>
            {filter === 'all'
              ? 'No submissions received yet.'
              : `No ${filter} submissions.`}
          </p>
        ) : (
          <>
            <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '12px' }}>
              Showing {sorted.length} {filter === 'all' ? '' : filter} submission(s). Click &quot;Export Excel&quot; to download.
            </p>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Sr.</th>
                    <th>Vendor Name</th>
                    <th>PAN</th>
                    <th>Trade Name</th>
                    <th>City</th>
                    <th>Contact</th>
                    <th>Submitted</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr key={s.id} onClick={() => openReview(s)}>
                      <td>{i + 1}</td>
                      <td><strong>{s.vendorName}</strong></td>
                      <td>{s.pan}</td>
                      <td>{s.tradeName || '-'}</td>
                      <td>{s.city || '-'}</td>
                      <td>{s.contactNo || '-'}</td>
                      <td>{new Date(s.submittedAt).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge badge-${s.status}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {selectedSubmission && (
        <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>KYC Review - {selectedSubmission.vendorName}</h2>
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

              <h3 style={{ fontSize: '15px', marginBottom: '12px', color: 'var(--gray-700)' }}>Basic Information</h3>
              <div className="detail-row"><span className="label">Vendor Name</span><span className="value">{selectedSubmission.vendorName}</span></div>
              <div className="detail-row"><span className="label">Legal Name</span><span className="value">{selectedSubmission.legalName || '-'}</span></div>
              <div className="detail-row"><span className="label">Trade Name</span><span className="value">{selectedSubmission.tradeName || '-'}</span></div>
              <div className="detail-row"><span className="label">Address</span><span className="value">{selectedSubmission.address || '-'}</span></div>
              <div className="detail-row"><span className="label">City</span><span className="value">{selectedSubmission.city || '-'}</span></div>
              <div className="detail-row"><span className="label">District</span><span className="value">{selectedSubmission.district || '-'}</span></div>
              <div className="detail-row"><span className="label">PIN Code</span><span className="value">{selectedSubmission.pinCode || '-'}</span></div>
              <div className="detail-row"><span className="label">Activity</span><span className="value">{selectedSubmission.activity || '-'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>Contact Details</h3>
              <div className="detail-row"><span className="label">Contact Person</span><span className="value">{selectedSubmission.contactPerson || '-'}</span></div>
              <div className="detail-row"><span className="label">Contact No.</span><span className="value">{selectedSubmission.contactNo || '-'}</span></div>
              <div className="detail-row"><span className="label">Email</span><span className="value">{selectedSubmission.contactEmail || '-'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>Income Tax Details</h3>
              <div className="detail-row"><span className="label">PAN</span><span className="value">{selectedSubmission.pan}</span></div>
              <div className="detail-row"><span className="label">TAN</span><span className="value">{selectedSubmission.tan || '-'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>GST Details</h3>
              <div className="detail-row"><span className="label">GST No.</span><span className="value">{selectedSubmission.gstNo || '-'}</span></div>
              <div className="detail-row"><span className="label">LUT No.</span><span className="value">{selectedSubmission.lutNo || '-'}</span></div>
              <div className="detail-row"><span className="label">Year</span><span className="value">{selectedSubmission.year || '-'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>MSME Details</h3>
              <div className="detail-row"><span className="label">MSME No.</span><span className="value">{selectedSubmission.msmeNo || '-'}</span></div>
              <div className="detail-row"><span className="label">Category</span><span className="value">{selectedSubmission.msmeCategory || '-'}</span></div>
              <div className="detail-row"><span className="label">Not Registered</span><span className="value">{selectedSubmission.gstNotRegistered ? 'Yes (URD Letter Required)' : 'No'}</span></div>

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>Bank Details</h3>
              <div className="detail-row"><span className="label">Bank Name</span><span className="value">{selectedSubmission.bankName || '-'}</span></div>
              <div className="detail-row"><span className="label">Account No.</span><span className="value">{selectedSubmission.bankAccountNo || '-'}</span></div>
              <div className="detail-row"><span className="label">IFSC Code</span><span className="value">{selectedSubmission.ifscCode || '-'}</span></div>

              {selectedSubmission.attachments && selectedSubmission.attachments.length > 0 && (
                <>
                  <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>
                    Attachments ({selectedSubmission.attachments.length})
                  </h3>
                  {selectedSubmission.attachments.map((att, i) => (
                    <div key={i} className="attachment-item clickable" onClick={() => openDocument(att)}>
                      <div className="file-info">
                        <span>📎</span>
                        <div>
                          <span><strong>{att.renamedName}</strong></span>
                          <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{att.type} | {(att.size / 1024).toFixed(1)} KB</div>
                        </div>
                      </div>
                      <button className="view-btn" onClick={(e) => { e.stopPropagation(); openDocument(att); }}>View</button>
                    </div>
                  ))}
                </>
              )}

              {selectedSubmission.comment && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--gray-200)' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--gray-600)' }}>Previous Comment:</strong>
                  <p style={{ fontSize: '14px', marginTop: '4px' }}>{selectedSubmission.comment}</p>
                </div>
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
              <button className="btn btn-outline" onClick={() => setSelectedSubmission(null)}>Close</button>
              {selectedSubmission.status !== 'rejected' && (
                <button className="btn btn-danger" onClick={() => handleAction('rejected')}>Reject</button>
              )}
              {selectedSubmission.status !== 'approved' && (
                <button className="btn btn-success" onClick={() => handleAction('approved')}>Approve</button>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingDoc && (
        <div className="doc-viewer-overlay" onClick={() => setViewingDoc(null)}>
          <div className="doc-viewer" onClick={(e) => e.stopPropagation()}>
            <div className="doc-viewer-header">
              <h3>{viewingDoc.renamedName} ({viewingDoc.type})</h3>
              <button className="btn-icon" onClick={() => setViewingDoc(null)}>✕</button>
            </div>
            <div className="doc-viewer-body">
              {(viewingDoc.dataUrl || viewingDoc.fileUrl) ? (
                isImage(viewingDoc.mimeType) ? (
                  <img src={(viewingDoc.dataUrl || viewingDoc.fileUrl)} alt={viewingDoc.renamedName} />
                ) : isPdf(viewingDoc.mimeType) ? (
                  <iframe src={(viewingDoc.dataUrl || viewingDoc.fileUrl)} title={viewingDoc.renamedName} />
                ) : (
                  <div className="no-preview">
                    <p style={{ fontSize: '48px', marginBottom: '12px' }}>📄</p>
                    <p><strong>{viewingDoc.renamedName}</strong></p>
                    <p style={{ marginTop: '8px' }}>Preview not available for this file type.</p>
                    <a href={(viewingDoc.dataUrl || viewingDoc.fileUrl)} download={viewingDoc.renamedName} className="btn btn-primary" style={{ marginTop: '16px', display: 'inline-flex' }}>Download File</a>
                  </div>
                )
              ) : (
                <div className="no-preview">
                  <p style={{ fontSize: '48px', marginBottom: '12px' }}>📄</p>
                  <p>No preview data available for this document.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
