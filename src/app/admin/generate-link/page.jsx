'use client';

import { useState, useRef } from 'react';
import { useKyc } from '@/context/KycContext';
import { generateEncryptedLink, validatePAN } from '@/lib/encryption';
import * as XLSX from 'xlsx';

function generateShortCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const EMPTY_ROW = { name: '', pan: '', email: '' };

export default function GenerateLink() {
  const { addLinks, links, loaded } = useKyc();
  const [activeTab, setActiveTab] = useState('manual');
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [errors, setErrors] = useState([]);
  const [toast, setToast] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const fileInputRef = useRef(null);

  const isExpired = (expiresAt) => new Date() > new Date(expiresAt);
  const [sending, setSending] = useState(false);

  // Send KYC link emails for created links
  const sendEmails = async (createdLinks) => {
    const baseUrl = getBaseUrl();
    const results = { sent: 0, failed: 0 };

    for (const link of createdLinks) {
      if (!link.email || !link.shortCode) continue;
      try {
        const res = await fetch('/api/send-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: link.email,
            vendorName: link.vendorName || link.pan,
            kycLink: `${baseUrl}/v/${link.shortCode}`,
          }),
        });
        if (res.ok) results.sent++;
        else results.failed++;
      } catch {
        results.failed++;
      }
    }
    return results;
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── Row management ──
  const updateRow = (index, field, value) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: field === 'pan' ? value.toUpperCase() : value } : r));
  };

  const addRow = () => setRows((prev) => [...prev, { ...EMPTY_ROW }]);

  const removeRow = (index) => {
    if (rows.length === 1) {
      setRows([{ ...EMPTY_ROW }]);
    } else {
      setRows((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // ── Excel template ──
  const downloadTemplate = () => {
    const templateData = [
      ['Vendor Name', 'PAN Number', 'Email'],
      ['Acme Pvt Ltd', 'ABCDE1234F', 'vendor@acme.com'],
      ['Global Services', 'BCDEF2345G', 'info@global.com'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendors');
    XLSX.writeFile(wb, 'KBS_Vendor_Link_Template.xlsx');
    showToast('Template downloaded!');
  };

  const getBaseUrl = () => {
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  };

  // ── Validate & generate from rows ──
  const handleGenerate = async () => {
    setErrors([]);
    const filledRows = rows.filter((r) => r.name.trim() || r.pan.trim() || r.email.trim());

    if (filledRows.length === 0) {
      setErrors(['Please fill at least one row']);
      return;
    }

    const errs = [];
    const valid = [];

    filledRows.forEach((row, i) => {
      const line = `Row ${i + 1}`;
      if (!row.name.trim()) { errs.push(`${line}: Name is required`); return; }
      if (!row.pan.trim()) { errs.push(`${line}: PAN is required`); return; }
      if (!validatePAN(row.pan)) { errs.push(`${line}: "${row.pan}" is not a valid PAN`); return; }
      if (!row.email.trim()) { errs.push(`${line}: Email is required`); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) { errs.push(`${line}: "${row.email}" is not a valid email`); return; }
      if (links.find((l) => l.pan === row.pan.toUpperCase().trim() && l.status !== 'submitted' && !isExpired(l.expiresAt))) {
        errs.push(`${line}: "${row.pan}" already has an active link`);
        return;
      }
      if (valid.find((v) => v.pan === row.pan.toUpperCase().trim())) {
        errs.push(`${line}: "${row.pan}" is duplicated`);
        return;
      }
      valid.push({ name: row.name.trim(), pan: row.pan.toUpperCase().trim(), email: row.email.trim() });
    });

    if (errs.length > 0) { setErrors(errs); return; }

    const newLinks = valid.map((v) => ({
      vendorName: v.name,
      pan: v.pan,
      email: v.email,
      link: generateEncryptedLink(v.pan, ''),
      shortCode: generateShortCode(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
    }));

    try {
      setSending(true);
      const created = await addLinks(newLinks);
      setRows([{ ...EMPTY_ROW }]);

      // Send emails
      const emailResults = await sendEmails(created);
      if (emailResults.failed > 0) {
        showToast(`${created.length} link(s) generated. Emails: ${emailResults.sent} sent, ${emailResults.failed} failed.`);
      } else {
        showToast(`${created.length} link(s) generated and emailed successfully!`);
      }
    } catch (err) {
      setErrors([`Failed to generate links: ${err.message}`]);
    } finally {
      setSending(false);
    }
  };

  // ── Excel upload ──
  const handleExcelUpload = (e) => {
    setErrors([]);
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const parsed = [];
        const errs = [];

        data.forEach((row, i) => {
          if (i === 0) return; // skip header
          const name = (row[0] || '').toString().trim();
          const pan = (row[1] || '').toString().toUpperCase().trim();
          const email = (row[2] || '').toString().trim();
          if (!name && !pan && !email) return; // skip empty rows

          const line = `Row ${i + 1}`;
          if (!name) { errs.push(`${line}: Name is empty`); return; }
          if (!pan) { errs.push(`${line}: PAN is empty`); return; }
          if (!validatePAN(pan)) { errs.push(`${line}: "${pan}" is not a valid PAN`); return; }
          if (!email) { errs.push(`${line}: Email is empty`); return; }
          if (links.find((l) => l.pan === pan && l.status !== 'submitted' && !isExpired(l.expiresAt))) {
            errs.push(`${line}: "${pan}" already has an active link`); return;
          }
          if (parsed.find((p) => p.pan === pan)) { errs.push(`${line}: "${pan}" duplicated`); return; }
          parsed.push({ name, pan, email });
        });

        if (errs.length > 0) setErrors(errs);

        if (parsed.length > 0) {
          const newLinks = parsed.map((v) => ({
            vendorName: v.name,
            pan: v.pan,
            email: v.email,
            link: generateEncryptedLink(v.pan, ''),
            shortCode: generateShortCode(),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'active',
          }));
          setSending(true);
          addLinks(newLinks)
            .then(async (created) => {
              const emailResults = await sendEmails(created);
              if (emailResults.failed > 0) {
                showToast(`${created.length} links generated. Emails: ${emailResults.sent} sent, ${emailResults.failed} failed.`);
              } else {
                showToast(`${created.length} links generated and emailed!`);
              }
            })
            .catch((err) => setErrors((prev) => [...prev, `Failed: ${err.message}`]))
            .finally(() => setSending(false));
        }
      } catch {
        setErrors(['Failed to read Excel file. Please check the format.']);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const copyToClipboard = (shortCode, id) => {
    const shortUrl = `${getBaseUrl()}/v/${shortCode}`;
    navigator.clipboard.writeText(shortUrl).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (!loaded) return <p>Loading...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <div className="page-header" style={{ position: 'static', marginTop: 0, paddingTop: 0, flexShrink: 0, marginBottom: '8px' }}>
        <h1>Generate Vendor Links</h1>
      </div>

      {/* Input Panel */}
      <div className="card" style={{ marginBottom: '10px', flexShrink: 0 }}>
        <div className="tabs">
          <button className={`tab ${activeTab === 'manual' ? 'active' : ''}`} onClick={() => { setActiveTab('manual'); setErrors([]); }}>
            Manual Input
          </button>
          <button className={`tab ${activeTab === 'excel' ? 'active' : ''}`} onClick={() => { setActiveTab('excel'); setErrors([]); }}>
            Excel Upload
          </button>
        </div>

        {activeTab === 'manual' && (
          <div>
            <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '11px', color: 'var(--gray-600)', fontWeight: '600' }}>Name <span style={{ color: 'var(--danger)' }}>*</span></th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '11px', color: 'var(--gray-600)', fontWeight: '600', width: '140px' }}>PAN <span style={{ color: 'var(--danger)' }}>*</span></th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '11px', color: 'var(--gray-600)', fontWeight: '600' }}>Email <span style={{ color: 'var(--danger)' }}>*</span></th>
                    <th style={{ width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="form-control" value={row.name} onChange={(e) => updateRow(i, 'name', e.target.value)} placeholder="Vendor name" style={{ padding: '6px 8px', fontSize: '13px' }} />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="form-control" value={row.pan} onChange={(e) => updateRow(i, 'pan', e.target.value)} placeholder="ABCDE1234F" maxLength={10} style={{ padding: '6px 8px', fontSize: '13px' }} />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="form-control" value={row.email} onChange={(e) => updateRow(i, 'email', e.target.value)} placeholder="email@example.com" type="email" style={{ padding: '6px 8px', fontSize: '13px' }} />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '16px', padding: '2px' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="btn btn-sm btn-outline" onClick={addRow}>+ Add Row</button>
              <button className="btn btn-sm btn-primary" onClick={handleGenerate} disabled={sending}>
                {sending ? 'Generating & Sending...' : 'Generate & Send Links'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'excel' && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-outline" onClick={downloadTemplate} style={{ whiteSpace: 'nowrap' }}>
              Download Template
            </button>
            <label className="btn btn-sm btn-primary" style={{ whiteSpace: 'nowrap', cursor: 'pointer', margin: 0 }}>
              Upload Excel
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{ display: 'none' }} />
            </label>
            <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Template columns: Name, PAN, Email</span>
          </div>
        )}

        {errors.length > 0 && (
          <div style={{ marginTop: '8px', maxHeight: '60px', overflowY: 'auto' }}>
            {errors.map((err, i) => (
              <p key={i} className="error-text">{err}</p>
            ))}
          </div>
        )}
      </div>

      {/* Generated Links Table */}
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {(() => {
          const activeLinks = links.filter((item) => item.status !== 'submitted' && !isExpired(item.expiresAt));
          return (
            <>
              <div className="card-header" style={{ flexShrink: 0 }}>
                <h2>Active Links ({activeLinks.length})</h2>
              </div>
              {activeLinks.length === 0 ? (
                <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '40px' }}>
                  No active links. Expired and submitted links are automatically removed from this list.
                </p>
              ) : (
                <div className="table-wrapper" style={{ flex: 1, maxHeight: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>PAN</th>
                        <th>Email</th>
                        <th>Link</th>
                        <th>Created</th>
                        <th>Expires</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...activeLinks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((item) => (
                        <tr key={item.id} style={{ cursor: 'default' }}>
                          <td>{item.vendorName || '-'}</td>
                          <td><strong>{item.pan}</strong></td>
                          <td style={{ fontSize: '13px' }}>{item.email || '-'}</td>
                          <td>
                            {item.shortCode ? (
                              <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '500' }}>
                                /v/{item.shortCode}
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Legacy</span>
                            )}
                          </td>
                          <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                          <td>{new Date(item.expiresAt).toLocaleDateString()}</td>
                          <td>
                            <span className="badge badge-active">active</span>
                          </td>
                          <td>
                            <button
                              className={`copy-btn ${copiedId === item.id ? 'copied' : ''}`}
                              onClick={() => copyToClipboard(item.shortCode, item.id)}
                              disabled={!item.shortCode}
                            >
                              {copiedId === item.id ? 'Copied!' : 'Copy Link'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
