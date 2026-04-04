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

export default function GenerateLink() {
  const { addLinks, links, loaded } = useKyc();
  const [activeTab, setActiveTab] = useState('multiple');
  const [multiPanInput, setMultiPanInput] = useState('');
  const [errors, setErrors] = useState([]);
  const [toast, setToast] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const fileInputRef = useRef(null);

  const isExpired = (expiresAt) => new Date() > new Date(expiresAt);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const downloadTemplate = () => {
    const templateData = [
      ['PAN Number'],
      ['ABCDE1234F'],
      ['BCDEF2345G'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 18 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PAN_Numbers');

    const instrData = [
      ['KBS Vendor KYC - PAN Upload Template Instructions'],
      [''],
      ['1. Go to the "PAN_Numbers" sheet'],
      ['2. Enter valid PAN numbers in Column A (first column)'],
      ['3. PAN format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)'],
      ['4. Row 1 is the header row - do not modify it'],
      ['5. Delete the example rows before entering your data'],
      ['6. Save the file and upload it in the "Excel Upload" tab'],
      [''],
      ['Note: Each PAN will generate a unique encrypted link valid for 4 days.'],
    ];
    const instrWs = XLSX.utils.aoa_to_sheet(instrData);
    instrWs['!cols'] = [{ wch: 70 }];
    XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');

    XLSX.writeFile(wb, 'KBS_PAN_Upload_Template.xlsx');
    showToast('Template downloaded!');
  };

  const getBaseUrl = () => {
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  };

  const handleMultipleAdd = async () => {
    setErrors([]);
    const pans = multiPanInput
      .split(/[\n,;]+/)
      .map((p) => p.toUpperCase().trim())
      .filter(Boolean);

    if (pans.length === 0) {
      setErrors(['Please enter at least one PAN number']);
      return;
    }

    const errs = [];
    const validPans = [];

    pans.forEach((pan, i) => {
      if (!validatePAN(pan)) {
        errs.push(`Line ${i + 1}: "${pan}" is not a valid PAN`);
      } else if (links.find((l) => l.pan === pan && l.status !== 'submitted' && !isExpired(l.expiresAt))) {
        errs.push(`"${pan}" already has an active link`);
      } else if (validPans.includes(pan)) {
        errs.push(`"${pan}" is duplicated`);
      } else {
        validPans.push(pan);
      }
    });

    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    const newLinks = validPans.map((pan) => {
      const shortCode = generateShortCode();
      return {
        pan,
        link: generateEncryptedLink(pan, ''),
        shortCode,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
      };
    });

    try {
      await addLinks(newLinks);
      setMultiPanInput('');
      showToast(`${newLinks.length} links generated successfully!`);
    } catch (err) {
      setErrors([`Failed to generate links: ${err.message}`]);
    }
  };

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

        const pans = [];
        const errs = [];

        data.forEach((row, i) => {
          const cell = (row[0] || '').toString().toUpperCase().trim();
          if (!cell || i === 0) return;
          if (!validatePAN(cell)) {
            errs.push(`Row ${i + 1}: "${cell}" is not a valid PAN`);
          } else if (links.find((l) => l.pan === cell && l.status !== 'submitted' && !isExpired(l.expiresAt))) {
            errs.push(`"${cell}" already has an active link`);
          } else if (pans.includes(cell)) {
            errs.push(`"${cell}" is duplicated in file`);
          } else {
            pans.push(cell);
          }
        });

        if (errs.length > 0) setErrors(errs);

        if (pans.length > 0) {
          const newLinks = pans.map((pan) => {
            const shortCode = generateShortCode();
            return {
              pan,
              link: generateEncryptedLink(pan, ''),
              shortCode,
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
              status: 'active',
            };
          });
          addLinks(newLinks)
            .then(() => showToast(`${newLinks.length} links generated from Excel!`))
            .catch((err) => setErrors((prev) => [...prev, `Failed to save links: ${err.message}`]));
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

      {/* Input Panel — compact, no scroll */}
      <div className="card" style={{ marginBottom: '10px', flexShrink: 0 }}>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'multiple' ? 'active' : ''}`}
            onClick={() => { setActiveTab('multiple'); setErrors([]); }}
          >
            Multiple Input
          </button>
          <button
            className={`tab ${activeTab === 'excel' ? 'active' : ''}`}
            onClick={() => { setActiveTab('excel'); setErrors([]); }}
          >
            Excel Upload
          </button>
        </div>

        {activeTab === 'multiple' && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <textarea
              className={`form-control ${errors.length ? 'error' : ''}`}
              value={multiPanInput}
              onChange={(e) => setMultiPanInput(e.target.value.toUpperCase())}
              placeholder={"ABCDE1234F, BCDEF2345G, CDEFG3456H (comma or newline separated)"}
              rows={2}
              style={{ flex: 1, resize: 'vertical', minHeight: '50px', maxHeight: '120px' }}
            />
            <button className="btn btn-primary" onClick={handleMultipleAdd} style={{ whiteSpace: 'nowrap', alignSelf: 'flex-end' }}>
              Generate Links
            </button>
          </div>
        )}

        {activeTab === 'excel' && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-outline" onClick={downloadTemplate} style={{ whiteSpace: 'nowrap' }}>
              Download Template
            </button>
            <label className="btn btn-sm btn-primary" style={{ whiteSpace: 'nowrap', cursor: 'pointer', margin: 0 }}>
              Upload Excel
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                style={{ display: 'none' }}
              />
            </label>
            <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Download template, fill PAN numbers in Column A, then upload (.xlsx, .xls)</span>
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

      {/* Generated Links Table — fills remaining height */}
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header" style={{ flexShrink: 0 }}>
          <h2>Generated Links ({links.length})</h2>
        </div>
        {links.length === 0 ? (
          <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '40px' }}>
            No links generated yet. Use the form above to create vendor KYC links.
          </p>
        ) : (
          <div className="table-wrapper" style={{ flex: 1, maxHeight: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>PAN Number</th>
                  <th>Link</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[...links].reverse().map((item) => {
                  const expired = isExpired(item.expiresAt);
                  const status = item.status === 'submitted' ? 'submitted' : expired ? 'expired' : 'active';
                  return (
                    <tr key={item.id} style={{ cursor: 'default' }}>
                      <td><strong>{item.pan}</strong></td>
                      <td>
                        {item.shortCode ? (
                          <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '500' }}>
                            /v/{item.shortCode}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Legacy link</span>
                        )}
                      </td>
                      <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                      <td>{new Date(item.expiresAt).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge badge-${status}`}>{status}</span>
                      </td>
                      <td>
                        <button
                          className={`copy-btn ${copiedId === item.id ? 'copied' : ''}`}
                          onClick={() => copyToClipboard(item.shortCode, item.id)}
                          disabled={expired || item.status === 'submitted' || !item.shortCode}
                        >
                          {copiedId === item.id ? 'Copied!' : 'Copy Link'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
