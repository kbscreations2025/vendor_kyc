'use client';

import { useState, useRef } from 'react';
import { useKyc } from '@/context/KycContext';
import { generateEncryptedLink, validatePAN } from '@/lib/encryption';
import * as XLSX from 'xlsx';

export default function GenerateLink() {
  const { addLinks, links, loaded } = useKyc();
  const [activeTab, setActiveTab] = useState('single');
  const [panInput, setPanInput] = useState('');
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

    // Column widths
    ws['!cols'] = [
      { wch: 18 },
      { wch: 30 },
      { wch: 35 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PAN_Numbers');

    // Add an instructions sheet
    const instrData = [
      ['KBS Vendor KYC - PAN Upload Template Instructions'],
      [''],
      ['1. Go to the "PAN_Numbers" sheet'],
      ['2. Enter valid PAN numbers in Column A (first column)'],
      ['3. PAN format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)'],
      ['4. Row 1 is the header row - do not modify it'],
      ['5. Delete the example rows (rows 2 & 3) before entering your data'],
      ['6. The "Vendor Name" and "Notes" columns are optional and for your reference only'],
      ['7. Only Column A (PAN Number) will be read during upload'],
      ['8. Save the file and upload it in the "Excel Upload" tab'],
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
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  };

  const handleSingleAdd = async () => {
    setErrors([]);
    const pan = panInput.toUpperCase().trim();
    if (!pan) {
      setErrors(['Please enter a PAN number']);
      return;
    }
    if (!validatePAN(pan)) {
      setErrors(['Invalid PAN format. Expected: ABCDE1234F']);
      return;
    }
    const activeLink = links.find((l) => l.pan === pan && l.status !== 'submitted' && !isExpired(l.expiresAt));
    if (activeLink) {
      setErrors(['An active link already exists for this PAN']);
      return;
    }
    const link = generateEncryptedLink(pan, getBaseUrl());
    try {
      await addLinks([
        {
          pan,
          link,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
        },
      ]);
      setPanInput('');
      showToast('Link generated successfully!');
    } catch (err) {
      setErrors([`Failed to generate link: ${err.message}`]);
    }
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

    const newLinks = validPans.map((pan) => ({
      pan,
      link: generateEncryptedLink(pan, getBaseUrl()),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
    }));

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
          if (!cell || i === 0) return; // skip header
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

        if (errs.length > 0) {
          setErrors(errs);
        }

        if (pans.length > 0) {
          const newLinks = pans.map((pan) => ({
            pan,
            link: generateEncryptedLink(pan, getBaseUrl()),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'active',
          }));
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

  const copyToClipboard = (link, id) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (!loaded) return <p>Loading...</p>;

  return (
    <>
      <div className="page-header">
        <h1>Generate Vendor Links</h1>
        <p>Create encrypted KYC form links for vendors using their PAN numbers</p>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'single' ? 'active' : ''}`}
            onClick={() => { setActiveTab('single'); setErrors([]); }}
          >
            Single Input
          </button>
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

        {activeTab === 'single' && (
          <div>
            <div className="form-group">
              <label>PAN Number <span className="required">*</span></label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  className={`form-control ${errors.length ? 'error' : ''}`}
                  value={panInput}
                  onChange={(e) => setPanInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  style={{ maxWidth: '300px' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSingleAdd()}
                />
                <button className="btn btn-primary" onClick={handleSingleAdd}>
                  Generate Link
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'multiple' && (
          <div>
            <div className="form-group">
              <label>PAN Numbers (one per line or comma-separated) <span className="required">*</span></label>
              <textarea
                className={`form-control ${errors.length ? 'error' : ''}`}
                value={multiPanInput}
                onChange={(e) => setMultiPanInput(e.target.value.toUpperCase())}
                placeholder={"ABCDE1234F\nBCDEF2345G\nCDEFG3456H"}
                rows={5}
              />
            </div>
            <button className="btn btn-primary" onClick={handleMultipleAdd}>
              Generate Links
            </button>
          </div>
        )}

        {activeTab === 'excel' && (
          <div>
            <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '16px' }}>
              Upload an Excel file (.xlsx, .xls) with PAN numbers in the first column. First row is treated as header.
            </p>

            <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--primary-light)', borderRadius: 'var(--radius)', border: '1px solid var(--primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--gray-900)' }}>Step 1: Download Template</p>
                  <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '2px' }}>
                    Download the Excel template, fill in PAN numbers, then upload.
                  </p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={downloadTemplate}>
                  📥 Download Template
                </button>
              </div>
            </div>

            <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--gray-900)', marginBottom: '8px' }}>Step 2: Upload Filled Template</p>
            <div
              className="upload-zone"
              onClick={() => fileInputRef.current?.click()}
            >
              <p style={{ fontSize: '32px', marginBottom: '8px' }}>📄</p>
              <p><strong>Click to upload filled Excel template</strong></p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>Supports .xlsx and .xls files</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {errors.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            {errors.map((err, i) => (
              <p key={i} className="error-text">{err}</p>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Generated Links ({links.length})</h2>
        </div>
        {links.length === 0 ? (
          <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '40px' }}>
            No links generated yet. Use the form above to create vendor KYC links.
          </p>
        ) : (
          <div className="table-wrapper">
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
                        <span style={{ fontSize: '12px', color: 'var(--gray-600)', maxWidth: '300px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.link}
                        </span>
                      </td>
                      <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                      <td>{new Date(item.expiresAt).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge badge-${status}`}>{status}</span>
                      </td>
                      <td>
                        <button
                          className={`copy-btn ${copiedId === item.id ? 'copied' : ''}`}
                          onClick={() => copyToClipboard(item.link, item.id)}
                          disabled={expired || item.status === 'submitted'}
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
    </>
  );
}
