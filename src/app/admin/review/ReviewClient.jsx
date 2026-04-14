'use client';

import { useState, useTransition, useOptimistic, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useKyc } from '@/context/KycContext';
import Toast, { useToast } from '@/components/Toast';
import * as XLSX from 'xlsx';

export default function ReviewClient({ submissions: serverSubmissions }) {
  const router = useRouter();
  const { markAsViewed, updateSubmissionStatus } = useKyc();
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [comment, setComment] = useState('');
  const [viewingDoc, setViewingDoc] = useState(null);
  const [isPending, startTransition] = useTransition();
  const { toast, showToast, clearToast } = useToast();

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDateRange, setExportDateRange] = useState('all');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');

  // All exportable columns
  const ALL_EXPORT_COLUMNS = [
    { key: 'vendorName', label: 'Vendor Name' },
    { key: 'legalName', label: 'Legal Name' },
    { key: 'tradeName', label: 'Trade Name' },
    { key: 'fullAddress', label: 'Address (Full)' },
    { key: 'activity', label: 'Activity' },
    { key: 'contactPerson', label: 'Contact Person' },
    { key: 'contactNo', label: 'Contact No.' },
    { key: 'contactEmail', label: 'Contact Email' },
    { key: 'pan', label: 'PAN' },
    { key: 'tan', label: 'TAN' },
    { key: 'gstNo', label: 'GST No.' },
    { key: 'gstNotRegistered', label: 'GST Not Registered' },
    { key: 'lutNo', label: 'LUT No.' },
    { key: 'lutYear', label: 'LUT Year' },
    { key: 'msmeNo', label: 'MSME No.' },
    { key: 'msmeCategory', label: 'MSME Category' },
    { key: 'bankName', label: 'Bank Name' },
    { key: 'bankAccountNo', label: 'Bank A/c No.' },
    { key: 'ifscCode', label: 'IFSC Code' },
    { key: 'attachments', label: 'Attachments' },
    { key: 'submittedAt', label: 'Submitted At' },
    { key: 'status', label: 'Status' },
    { key: 'comment', label: 'Admin Comment' },
  ];

  const [exportColumns, setExportColumns] = useState(() =>
    ALL_EXPORT_COLUMNS.map((c) => c.key)
  );

  const toggleExportColumn = (key) => {
    setExportColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Column filters
  const [filters, setFilters] = useState({
    vendorOrTrade: '',
    pan: '',
    gstNo: '',
    msmeNo: '',
    msmeCategory: 'all',
    activity: '',
    dateRange: 'all',
    dateFrom: '',
    dateTo: '',
    status: 'all',
    reKyc: 'all',
  });

  const updateFilter = (key, value) => {
    setFilters((prev) => {
      const updated = { ...prev, [key]: value };
      // When switching date range preset, clear custom dates
      if (key === 'dateRange' && value !== 'custom') {
        updated.dateFrom = '';
        updated.dateTo = '';
      }
      return updated;
    });
  };

  // Optimistic state
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

  // Helper: combine address fields for display/filter
  const getFullAddress = (s) => {
    return [s.address, s.city, s.district, s.pinCode].filter(Boolean).join(', ');
  };

  // Helper: get date range start based on preset
  const getDateRangeStart = (preset) => {
    const now = new Date();
    switch (preset) {
      case 'last1m': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      case 'last2m': return new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
      case 'last3m': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      default: return null;
    }
  };

  // Apply column filters + sort
  const sorted = useMemo(() => {
    let result = optimisticSubmissions;

    if (filters.vendorOrTrade) {
      const q = filters.vendorOrTrade.toLowerCase();
      result = result.filter((s) =>
        (s.vendorName || '').toLowerCase().includes(q) ||
        (s.tradeName || '').toLowerCase().includes(q) ||
        (s.legalName || '').toLowerCase().includes(q)
      );
    }
    if (filters.pan) {
      result = result.filter((s) => (s.pan || '').toLowerCase().includes(filters.pan.toLowerCase()));
    }
    if (filters.gstNo) {
      result = result.filter((s) => (s.gstNo || '').toLowerCase().includes(filters.gstNo.toLowerCase()));
    }
    if (filters.msmeNo) {
      result = result.filter((s) => (s.msmeNo || '').toLowerCase().includes(filters.msmeNo.toLowerCase()));
    }
    if (filters.msmeCategory !== 'all') {
      result = result.filter((s) => (s.msmeCategory || '') === filters.msmeCategory);
    }
    if (filters.activity) {
      result = result.filter((s) => (s.activity || '').toLowerCase().includes(filters.activity.toLowerCase()));
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      if (filters.dateRange === 'custom') {
        const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
        const to = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59') : null;
        result = result.filter((s) => {
          if (!s.submittedAt) return false;
          const d = new Date(s.submittedAt);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      } else {
        const rangeStart = getDateRangeStart(filters.dateRange);
        if (rangeStart) {
          result = result.filter((s) => s.submittedAt && new Date(s.submittedAt) >= rangeStart);
        }
      }
    }

    if (filters.status !== 'all') {
      result = result.filter((s) => s.status === filters.status);
    }

    // Re-KYC filter
    if (filters.reKyc !== 'all') {
      result = result.filter((s) => {
        if (!s.submittedAt) return false;
        const reKycDate = new Date(s.submittedAt);
        reKycDate.setFullYear(reKycDate.getFullYear() + 3);
        const diffDays = Math.ceil((reKycDate - new Date()) / (1000 * 60 * 60 * 24));
        switch (filters.reKyc) {
          case 'expired': return diffDays <= 0;
          case '90days': return diffDays > 0 && diffDays <= 90;
          case '1year': return diffDays > 0 && diffDays <= 365;
          case '2year': return diffDays > 0 && diffDays <= 730;
          default: return true;
        }
      });
    }

    return [...result].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  }, [optimisticSubmissions, filters]);

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
    if (k === 'status' || k === 'dateRange' || k === 'reKyc' || k === 'msmeCategory') return v !== 'all';
    return v !== '';
  });

  const clearFilters = () => {
    setFilters({ vendorOrTrade: '', pan: '', gstNo: '', msmeNo: '', msmeCategory: 'all', activity: '', dateRange: 'all', dateFrom: '', dateTo: '', status: 'all', reKyc: 'all' });
  };

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

    setSelectedSubmission(null);
    setComment('');

    applyOptimistic({ id: subId, status, comment: currentComment });

    startTransition(async () => {
      try {
        await updateSubmissionStatus(subId, status, currentComment);
        showToast(`Submission ${label.toLowerCase()} successfully.`, 'success');
        router.refresh();
      } catch (err) {
        showToast(`Failed to update status: ${err.message}`, 'error');
        router.refresh();
      }
    });
  };

  const openDocument = (att) => setViewingDoc(att);
  const isImage = (mimeType) => mimeType && mimeType.startsWith('image/');
  const isPdf = (mimeType) => mimeType && mimeType === 'application/pdf';

  const formatValue = (key, s) => {
    switch (key) {
      case 'fullAddress': return [s.address, s.city, s.district, s.pinCode].filter(Boolean).join(', ');
      case 'gstNotRegistered': return s.gstNotRegistered ? 'Yes' : 'No';
      case 'attachments': return (s.attachments || []).map((a) => a.renamedName).join(', ');
      case 'submittedAt': return s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '';
      default: return s[key] || '';
    }
  };

  // Get rows filtered by export date range
  const getExportRows = () => {
    let rows = sorted;
    if (exportDateRange === 'custom') {
      const from = exportDateFrom ? new Date(exportDateFrom) : null;
      const to = exportDateTo ? new Date(exportDateTo + 'T23:59:59') : null;
      rows = rows.filter((s) => {
        if (!s.submittedAt) return false;
        const d = new Date(s.submittedAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    } else if (exportDateRange !== 'all') {
      const rangeStart = getDateRangeStart(exportDateRange);
      if (rangeStart) {
        rows = rows.filter((s) => s.submittedAt && new Date(s.submittedAt) >= rangeStart);
      }
    }
    return rows;
  };

  const exportRows = showExportModal ? getExportRows() : [];

  const exportToExcel = () => {
    if (exportRows.length === 0 || exportColumns.length === 0) return;
    try {
      const selectedCols = ALL_EXPORT_COLUMNS.filter((c) => exportColumns.includes(c.key));

      const exportData = exportRows.map((s, index) => {
        const row = { 'Sr. No.': index + 1 };
        selectedCols.forEach((col) => {
          row[col.label] = formatValue(col.key, s);
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const colWidths = Object.keys(exportData[0]).map((key) => {
        const maxLen = Math.max(key.length, ...exportData.map((row) => String(row[key] || '').length));
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'KYC_Submissions');
      XLSX.writeFile(wb, `KBS_Vendor_KYC_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setShowExportModal(false);
      showToast(`Exported ${exportRows.length} rows with ${selectedCols.length} columns.`, 'success');
    } catch (err) {
      showToast('Failed to export Excel. Please try again.', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header" style={{ flexShrink: 0 }}>
          <h2>
            Submissions ({sorted.length} of {optimisticSubmissions.length})
            {isPending && <span style={{ fontSize: '13px', color: 'var(--gray-400)', fontWeight: '400', marginLeft: '10px' }}>Updating...</span>}
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {hasActiveFilters && (
              <button className="btn btn-sm btn-outline" onClick={clearFilters}>
                Clear Filters
              </button>
            )}
            <button
              className="btn btn-sm btn-success"
              onClick={() => setShowExportModal(true)}
              disabled={sorted.length === 0}
            >
              Export Excel
            </button>
          </div>
        </div>

        {optimisticSubmissions.length === 0 ? (
          <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '40px' }}>
            No submissions received yet.
          </p>
        ) : (
          <div className="table-wrapper" style={{ flex: 1, maxHeight: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Sr.</th>
                  <th>Vendor / Trade Name</th>
                  <th>PAN</th>
                  <th>GST No.</th>
                  <th>MSME No.</th>
                  <th>MSME Category</th>
                  <th>Activity</th>
                  <th>Status</th>
                </tr>
                <tr className="filter-row">
                  <th></th>
                  <th><input placeholder="Search name..." value={filters.vendorOrTrade} onChange={(e) => updateFilter('vendorOrTrade', e.target.value)} /></th>
                  <th><input placeholder="Filter..." value={filters.pan} onChange={(e) => updateFilter('pan', e.target.value)} /></th>
                  <th><input placeholder="Filter..." value={filters.gstNo} onChange={(e) => updateFilter('gstNo', e.target.value)} /></th>
                  <th><input placeholder="Filter..." value={filters.msmeNo} onChange={(e) => updateFilter('msmeNo', e.target.value)} /></th>
                  <th>
                    <select value={filters.msmeCategory} onChange={(e) => updateFilter('msmeCategory', e.target.value)}>
                      <option value="all">All</option>
                      <option value="Micro">Micro</option>
                      <option value="Small">Small</option>
                      <option value="Medium">Medium</option>
                    </select>
                  </th>
                  <th><input placeholder="Filter..." value={filters.activity} onChange={(e) => updateFilter('activity', e.target.value)} /></th>
                  <th>
                    <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="viewed">Viewed</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--gray-500)' }}>
                      No submissions match your filters.
                    </td>
                  </tr>
                ) : (
                  sorted.map((s, i) => (
                    <tr key={s.id} onClick={() => openReview(s)}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{s.vendorName || '-'}</strong>
                        {s.tradeName && s.tradeName !== s.vendorName && (
                          <span style={{ color: 'var(--gray-500)' }}> ({s.tradeName})</span>
                        )}
                      </td>
                      <td>{s.pan || '-'}</td>
                      <td>{s.gstNotRegistered ? <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Not Registered</span> : (s.gstNo || '-')}</td>
                      <td>{s.msmeNotRegistered ? <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Not Registered</span> : (s.msmeNo || '-')}</td>
                      <td>{s.msmeCategory || '-'}</td>
                      <td style={{ fontSize: '13px', maxWidth: '180px' }}>{s.activity || '-'}</td>
                      <td>
                        <span className={`badge badge-${s.status}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedSubmission && (
        <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>KYC Review - {selectedSubmission.vendorName}</h2>
              <button className="btn-icon" onClick={() => setSelectedSubmission(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px' }}>
                <span className={`badge badge-${selectedSubmission.status}`}>{selectedSubmission.status}</span>
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
              <div className="detail-row"><span className="label">GST No.</span><span className="value">{selectedSubmission.gstNotRegistered ? 'Not Registered' : (selectedSubmission.gstNo || '-')}</span></div>
              {!selectedSubmission.gstNotRegistered && (
                <div className="detail-row"><span className="label">Type of Registration</span><span className="value">{selectedSubmission.gstRegType || '-'}</span></div>
              )}
              {!selectedSubmission.gstNotRegistered && selectedSubmission.goodsSent && (
                <>
                  <div className="detail-row"><span className="label">LUT No.</span><span className="value">{selectedSubmission.lutNo || '-'}</span></div>
                  <div className="detail-row"><span className="label">LUT Year</span><span className="value">{selectedSubmission.lutYear || '-'}</span></div>
                </>
              )}

              <h3 style={{ fontSize: '15px', margin: '20px 0 12px', color: 'var(--gray-700)' }}>MSME Details</h3>
              <div className="detail-row"><span className="label">MSME No.</span><span className="value">{selectedSubmission.msmeNotRegistered ? 'Not Registered' : (selectedSubmission.msmeNo || '-')}</span></div>
              {!selectedSubmission.msmeNotRegistered && (
                <>
                  <div className="detail-row"><span className="label">Category</span><span className="value">{selectedSubmission.msmeCategory || '-'}</span></div>
                  <div className="detail-row"><span className="label">MSME Year</span><span className="value">{selectedSubmission.msmeYear || '-'}</span></div>
                </>
              )}

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

              {selectedSubmission.status !== 'approved' && (
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
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedSubmission(null)}>Close</button>
              {selectedSubmission.status === 'approved' ? (
                <span style={{ padding: '8px 16px', background: 'var(--success-light)', color: 'var(--success)', borderRadius: 'var(--radius)', fontSize: '13px', fontWeight: '600' }}>
                  This vendor is approved and cannot be changed
                </span>
              ) : (
                <>
                  <button className="btn btn-danger" onClick={() => handleAction('rejected')}>Reject</button>
                  <button className="btn btn-success" onClick={() => handleAction('approved')}>Approve</button>
                </>
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

      {/* Export Column Picker Modal */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Export to Excel</h2>
              <button className="btn-icon" onClick={() => setShowExportModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Date Range Filter */}
              <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--gray-200)' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)', display: 'block', marginBottom: '8px' }}>
                  Date Range
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { value: 'all', label: 'All Time' },
                    { value: 'last1m', label: 'Last 1 Month' },
                    { value: 'last2m', label: 'Last 2 Months' },
                    { value: 'last3m', label: 'Last 3 Months' },
                    { value: 'custom', label: 'Custom' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      className={`btn btn-sm ${exportDateRange === opt.value ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => {
                        setExportDateRange(opt.value);
                        if (opt.value !== 'custom') { setExportDateFrom(''); setExportDateTo(''); }
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {exportDateRange === 'custom' && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--gray-500)' }}>From</label>
                      <input type="date" className="form-control" style={{ fontSize: '13px', padding: '6px 10px' }} value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--gray-500)' }}>To</label>
                      <input type="date" className="form-control" style={{ fontSize: '13px', padding: '6px 10px' }} value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} />
                    </div>
                  </div>
                )}
                <p style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '8px', margin: '8px 0 0' }}>
                  <strong>{exportRows.length}</strong> rows match this date range{hasActiveFilters ? ' (table filters also applied)' : ''}
                </p>
              </div>

              {/* Column Picker */}
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)', display: 'block', marginBottom: '8px' }}>
                Columns to Export
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button className="btn btn-sm btn-outline" onClick={() => setExportColumns(ALL_EXPORT_COLUMNS.map((c) => c.key))}>
                  Select All
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => setExportColumns([])}>
                  Deselect All
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '250px', overflowY: 'auto', padding: '4px 0' }}>
                {ALL_EXPORT_COLUMNS.map((col) => (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', padding: '4px 8px', borderRadius: '4px', background: exportColumns.includes(col.key) ? 'var(--primary-light)' : 'transparent' }}>
                    <input
                      type="checkbox"
                      checked={exportColumns.includes(col.key)}
                      onChange={() => toggleExportColumn(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowExportModal(false)}>Cancel</button>
              <button
                className="btn btn-success"
                onClick={exportToExcel}
                disabled={exportColumns.length === 0 || exportRows.length === 0}
              >
                Export {exportRows.length} Rows / {exportColumns.length} Columns
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}
