'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { decryptAndValidateToken } from '@/lib/encryption';
import { useKyc } from '@/context/KycContext';
import { saveDraft, loadDraft, clearDraft } from '@/lib/formCache';

// Dropdown types for additional documents (URD Letter & MSME Declaration handled separately)
const ATTACHMENT_TYPES = [
  'PAN Card',
  'Aadhaar Card',
  'GST Certificate',
  'MSME Certificate',
  'Cancelled Cheque',
  'Bank Statement',
  'LUT Certificate',
  'Incorporation Certificate',
  'Other',
];

// --- Validation helpers ---
function isOnlyLettersSpaces(val) {
  return /^[A-Za-z\s]+$/.test(val);
}
function isValidEmail(val) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val.trim());
}
function isValidPhone(val) {
  return /^[6-9][0-9]{9}$/.test(val.trim());
}
function isValidPIN(val) {
  return /^[1-9][0-9]{5}$/.test(val.trim());
}
function isValidIFSC(val) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.toUpperCase().trim());
}
function isValidGST(val) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(val.toUpperCase().trim());
}
function isValidTAN(val) {
  return /^[A-Z]{4}[0-9]{5}[A-Z]{1}$/.test(val.toUpperCase().trim());
}
function isOnlyDigits(val) {
  return /^[0-9]+$/.test(val.trim());
}

function FormContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { addSubmission, submissions } = useKyc();
  const fileInputRef = useRef(null);
  const urdFileRef = useRef(null);
  const msmeFileRef = useRef(null);

  const [tokenData, setTokenData] = useState(null);
  const [tokenError, setTokenError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [expiredDate, setExpiredDate] = useState('');
  const [isAlreadySubmitted, setIsAlreadySubmitted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    vendorName: '',
    legalName: '',
    tradeName: '',
    address: '',
    city: '',
    district: '',
    pinCode: '',
    contactPerson: '',
    contactNo: '',
    contactEmail: '',
    pan: '',
    tan: '',
    gstNo: '',
    gstNotRegistered: false,
    lutNo: '',
    year: '',
    msmeNo: '',
    msmeCategory: '',
    msmeNotRegistered: false,
    bankName: '',
    bankAccountNo: '',
    ifscCode: '',
    activity: '',
  });

  const [attachments, setAttachments] = useState([]);
  const [attachType, setAttachType] = useState('PAN Card');
  const [draftRestored, setDraftRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Restore cached draft for non-confidential fields
  useEffect(() => {
    const draft = loadDraft();
    if (draft && !draftRestored) {
      setForm((prev) => {
        const merged = { ...prev };
        for (const [key, value] of Object.entries(draft)) {
          if (key in merged && value !== undefined && value !== '') {
            merged[key] = value;
          }
        }
        return merged;
      });
      setDraftRestored(true);
    }
  }, [draftRestored]);

  // Auto-save draft on form changes (debounced)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!tokenData) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(form);
    }, 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [form, tokenData]);

  useEffect(() => {
    if (!token) {
      setTokenError('No access token. Please use the link provided by KBS admin.');
      return;
    }
    const result = decryptAndValidateToken(token);
    if (!result.valid) {
      if (result.expired) {
        setIsExpired(true);
        setExpiredDate(result.expiresAt || '');
      }
      setTokenError(result.error);
    } else {
      const alreadySubmitted = submissions.find((s) => s.pan === result.pan);
      if (alreadySubmitted) {
        setIsAlreadySubmitted(true);
        setTokenError('This KYC form has already been submitted.');
      } else {
        setTokenData(result);
        setForm((prev) => ({ ...prev, pan: result.pan }));
      }
    }
  }, [token, submissions]);

  const updateField = (field, value) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };

      // When GST not registered is checked → clear GST fields
      if (field === 'gstNotRegistered' && value === true) {
        updated.gstNo = '';
        updated.lutNo = '';
        updated.year = '';
      }

      // When MSME not registered is checked → clear MSME fields
      if (field === 'msmeNotRegistered' && value === true) {
        updated.msmeNo = '';
        updated.msmeCategory = '';
      }

      return updated;
    });

    // Clear related errors
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (field === 'gstNotRegistered') {
      setErrors((prev) => { const next = { ...prev }; delete next.gstNo; delete next.lutNo; delete next.urdLetter; return next; });
    }
    if (field === 'msmeNotRegistered') {
      setErrors((prev) => { const next = { ...prev }; delete next.msmeNo; delete next.msmeDeclaration; return next; });
    }
  };

  // Only allow digits in number fields
  const handleNumberInput = (field, value, maxLen) => {
    const digits = value.replace(/[^0-9]/g, '');
    if (maxLen && digits.length > maxLen) return;
    updateField(field, digits);
  };

  // Only allow letters and spaces in text fields
  const handleTextInput = (field, value) => {
    const cleaned = value.replace(/[^A-Za-z\s]/g, '');
    updateField(field, cleaned);
  };

  // Convert file to base64 data URL for storage & preview
  const fileToDataUrl = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  };

  const handleFileAdd = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const ext = file.name.split('.').pop();
    const baseName = file.name.replace(`.${ext}`, '');
    const typePrefix = attachType.replace(/\s+/g, '_');
    const renamedName = `${typePrefix}_${baseName}.${ext}`;

    const dataUrl = await fileToDataUrl(file);

    setAttachments((prev) => [
      ...prev,
      {
        originalName: file.name,
        renamedName,
        type: attachType,
        size: file.size,
        dataUrl,
        mimeType: file.type,
      },
    ]);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Handler for required document uploads (URD Letter, MSME Declaration)
  const handleRequiredDocUpload = async (e, docType) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      e.target.value = '';
      return;
    }

    // Remove any existing attachment of this type first
    setAttachments((prev) => prev.filter((a) => a.type !== docType));

    const ext = file.name.split('.').pop();
    const baseName = file.name.replace(`.${ext}`, '');
    const typePrefix = docType.replace(/\s+/g, '_');
    const renamedName = `${typePrefix}_${baseName}.${ext}`;
    const dataUrl = await fileToDataUrl(file);

    setAttachments((prev) => [
      ...prev,
      { originalName: file.name, renamedName, type: docType, size: file.size, dataUrl, mimeType: file.type },
    ]);

    // Clear error for this doc type
    if (docType === 'URD Letter' && errors.urdLetter) {
      setErrors((prev) => { const next = { ...prev }; delete next.urdLetter; return next; });
    }
    if (docType === 'MSME Declaration' && errors.msmeDeclaration) {
      setErrors((prev) => { const next = { ...prev }; delete next.msmeDeclaration; return next; });
    }

    e.target.value = '';
  };

  const validate = () => {
    const errs = {};

    // ── Basic Information ──
    if (!form.vendorName.trim()) errs.vendorName = 'Vendor Name is required';
    else if (!isOnlyLettersSpaces(form.vendorName.trim())) errs.vendorName = 'Vendor Name must contain only letters';

    if (!form.legalName.trim()) errs.legalName = 'Legal Name is required';
    else if (!isOnlyLettersSpaces(form.legalName.trim())) errs.legalName = 'Legal Name must contain only letters';

    if (!form.tradeName.trim()) errs.tradeName = 'Trade Name is required';

    // ── Address ──
    if (!form.address.trim()) errs.address = 'Address is required';
    else if (form.address.trim().length < 10) errs.address = 'Address must be at least 10 characters';

    if (!form.city.trim()) errs.city = 'City is required';
    else if (!isOnlyLettersSpaces(form.city.trim())) errs.city = 'City must contain only letters';

    if (!form.district.trim()) errs.district = 'District is required';
    else if (!isOnlyLettersSpaces(form.district.trim())) errs.district = 'District must contain only letters';

    if (!form.pinCode.trim()) errs.pinCode = 'PIN Code is required';
    else if (!isValidPIN(form.pinCode)) errs.pinCode = 'Enter valid 6-digit PIN code';

    if (!form.activity) errs.activity = 'Activity is required';

    // ── Contact ──
    if (!form.contactPerson.trim()) errs.contactPerson = 'Contact Person Name is required';
    else if (!isOnlyLettersSpaces(form.contactPerson.trim())) errs.contactPerson = 'Name must contain only letters';

    if (!form.contactNo.trim()) errs.contactNo = 'Contact No. is required';
    else if (!isValidPhone(form.contactNo)) errs.contactNo = 'Enter valid 10-digit mobile number (starting with 6-9)';

    if (!form.contactEmail.trim()) errs.contactEmail = 'Email is required';
    else if (!isValidEmail(form.contactEmail)) errs.contactEmail = 'Enter a valid email address';

    // ── Income Tax ──
    if (!form.pan.trim()) errs.pan = 'PAN is required';

    // TAN is OPTIONAL — only validate format if filled
    if (form.tan.trim() && !isValidTAN(form.tan)) errs.tan = 'Enter valid TAN (e.g. ABCD12345E)';

    // ── GST (conditional) ──
    if (!form.gstNotRegistered) {
      if (!form.gstNo.trim()) errs.gstNo = 'GST No. is required (or mark as not registered)';
      else if (!isValidGST(form.gstNo)) errs.gstNo = 'Enter valid 15-digit GST number';

      if (!form.lutNo.trim()) errs.lutNo = 'LUT No. is required';
      if (!form.year.trim()) errs.year = 'Year is required';
    } else {
      // URD Letter attachment required when GST not registered
      const hasUrdLetter = attachments.some((a) => a.type === 'URD Letter');
      if (!hasUrdLetter) {
        errs.urdLetter = 'URD Letter attachment is required when GST is not registered. Please download the template, fill it, and upload.';
      }
    }

    // ── MSME (conditional) ──
    if (!form.msmeNotRegistered) {
      if (!form.msmeNo.trim()) errs.msmeNo = 'MSME No. is required (or mark as not registered)';
      if (!form.msmeCategory) errs.msmeCategory = 'MSME Category is required';
    } else {
      // MSME Declaration attachment required when not registered
      const hasMsmeDeclaration = attachments.some((a) => a.type === 'MSME Declaration');
      if (!hasMsmeDeclaration) {
        errs.msmeDeclaration = 'MSME Declaration attachment is required when MSME is not registered. Please download the template, fill it, and upload.';
      }
    }

    // ── Bank Details ──
    if (!form.bankName.trim()) errs.bankName = 'Bank Name is required';
    else if (!isOnlyLettersSpaces(form.bankName.trim())) errs.bankName = 'Bank Name must contain only letters';

    if (!form.bankAccountNo.trim()) errs.bankAccountNo = 'Bank A/c No. is required';
    else if (!isOnlyDigits(form.bankAccountNo)) errs.bankAccountNo = 'Account number must contain only digits';
    else if (form.bankAccountNo.trim().length < 9 || form.bankAccountNo.trim().length > 18) errs.bankAccountNo = 'Account number must be 9-18 digits';

    if (!form.ifscCode.trim()) errs.ifscCode = 'IFSC Code is required';
    else if (!isValidIFSC(form.ifscCode)) errs.ifscCode = 'Enter valid IFSC code (e.g. SBIN0001234)';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    try {
      const submission = {
        ...form,
        pan: form.pan.toUpperCase().trim(),
        tan: form.tan.toUpperCase().trim(),
        gstNo: form.gstNo.toUpperCase().trim(),
        ifscCode: form.ifscCode.toUpperCase().trim(),
        attachments: attachments.map(({ originalName, renamedName, type, size, dataUrl, mimeType }) => ({
          originalName,
          renamedName,
          type,
          size,
          dataUrl,
          mimeType,
        })),
        submittedAt: new Date().toISOString(),
        status: 'pending',
        comment: '',
      };

      await addSubmission(submission);
      clearDraft();
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert('Failed to submit form. Please try again.');
      console.error('Submission error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (tokenError) {
    if (isExpired) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>⏰</div>
            <h1 style={{ fontSize: '22px', marginBottom: '10px', color: 'var(--warning)' }}>Link Expired</h1>
            <p style={{ color: 'var(--gray-700)', fontSize: '15px', marginBottom: '12px' }}>
              This KYC form link has expired and is no longer valid.
            </p>
            {expiredDate && (
              <p style={{ color: 'var(--gray-500)', fontSize: '13px', marginBottom: '16px' }}>
                Expired on: <strong>{new Date(expiredDate).toLocaleString()}</strong>
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

    if (isAlreadySubmitted) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>📋</div>
            <h1 style={{ fontSize: '22px', marginBottom: '10px', color: 'var(--primary)' }}>Already Submitted</h1>
            <p style={{ color: 'var(--gray-700)', fontSize: '15px', marginBottom: '12px' }}>
              The KYC form for this PAN number has already been submitted.
            </p>
            <div style={{ padding: '16px', background: 'var(--primary-light)', borderRadius: 'var(--radius)', border: '1px solid var(--primary)', marginTop: '8px' }}>
              <p style={{ fontSize: '14px', color: 'var(--gray-800)' }}>
                Your KYC submission is under review by the KBS admin. You cannot submit the form again using this link. If you need to make changes, please contact the KBS admin.
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
            {tokenError}
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

  if (!tokenData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading form...</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-50)' }}>
        <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h1 style={{ fontSize: '22px', marginBottom: '8px', color: 'var(--success)' }}>KYC Submitted Successfully!</h1>
          <p style={{ color: 'var(--gray-600)' }}>
            Your KYC form has been submitted to KBS for review. The admin will review your submission and update the status.
            This link is now expired.
          </p>
        </div>
      </div>
    );
  }

  const renderField = (label, field, opts = {}) => {
    const { required = false, type = 'text', placeholder = '', disabled = false, maxLength, inputMode, onChangeOverride } = opts;
    return (
      <div className="form-group">
        <label>
          {label} {required && <span className="required">*</span>}
        </label>
        <input
          type={type}
          className={`form-control ${errors[field] ? 'error' : ''}`}
          value={form[field]}
          onChange={onChangeOverride || ((e) => updateField(field, e.target.value))}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          inputMode={inputMode}
        />
        {errors[field] && <p className="error-text">{errors[field]}</p>}
      </div>
    );
  };

  return (
    <div style={{ background: 'var(--gray-50)', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700' }}>KBS - Vendor KYC Form</h1>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px', marginTop: '8px' }}>
            Please fill in all required details. Fields marked with <span style={{ color: 'var(--danger)' }}>*</span> are mandatory.
          </p>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>
            Link expires: {new Date(tokenData.expiresAt).toLocaleString()}
          </p>
        </div>

        {draftRestored && (
          <div style={{ padding: '10px 16px', background: '#e8f4fd', borderRadius: 'var(--radius)', marginBottom: '12px', border: '1px solid #90caf9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: '#1565c0', fontSize: '13px' }}>
              Your previously entered data has been restored. Confidential fields (bank details, PAN, TAN, etc.) were not cached for security.
            </p>
            <button
              style={{ background: 'none', border: 'none', color: '#1565c0', cursor: 'pointer', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', marginLeft: '12px' }}
              onClick={() => setDraftRestored(false)}
            >
              Dismiss
            </button>
          </div>
        )}

        {Object.keys(errors).length > 0 && (
          <div style={{ padding: '12px 16px', background: 'var(--danger-light)', borderRadius: 'var(--radius)', marginBottom: '20px', border: '1px solid var(--danger)' }}>
            <p style={{ color: 'var(--danger)', fontSize: '14px', fontWeight: '500' }}>
              Please fix the {Object.keys(errors).length} error(s) highlighted below before submitting.
            </p>
          </div>
        )}

        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="form-section">
            <h3>Basic Information</h3>
            <div className="form-grid">
              {renderField('Vendor Name', 'vendorName', { required: true, placeholder: 'Enter vendor name', onChangeOverride: (e) => handleTextInput('vendorName', e.target.value) })}
              {renderField('Legal Name', 'legalName', { required: true, placeholder: 'Enter legal name', onChangeOverride: (e) => handleTextInput('legalName', e.target.value) })}
              {renderField('Trade Name', 'tradeName', { required: true, placeholder: 'Enter trade name' })}
            </div>
          </div>

          <div className="form-section">
            <h3>Address Details</h3>
            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Address <span className="required">*</span></label>
                <textarea
                  className={`form-control ${errors.address ? 'error' : ''}`}
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="Enter full address"
                  rows={2}
                />
                {errors.address && <p className="error-text">{errors.address}</p>}
              </div>
              {renderField('City', 'city', { required: true, placeholder: 'Enter city', onChangeOverride: (e) => handleTextInput('city', e.target.value) })}
              {renderField('District', 'district', { required: true, placeholder: 'Enter district', onChangeOverride: (e) => handleTextInput('district', e.target.value) })}
              {renderField('PIN Code', 'pinCode', { required: true, placeholder: 'Enter 6-digit PIN', maxLength: 6, inputMode: 'numeric', onChangeOverride: (e) => handleNumberInput('pinCode', e.target.value, 6) })}
              <div className="form-group">
                <label>Activity (Manufacturing/Service/Trading) <span className="required">*</span></label>
                <select
                  className={`form-control ${errors.activity ? 'error' : ''}`}
                  value={form.activity}
                  onChange={(e) => updateField('activity', e.target.value)}
                >
                  <option value="">Select Activity</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Service">Service</option>
                  <option value="Trading">Trading</option>
                </select>
                {errors.activity && <p className="error-text">{errors.activity}</p>}
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Contact Details</h3>
            <div className="form-grid">
              {renderField('Contact Person Name', 'contactPerson', { required: true, placeholder: 'Enter contact person name', onChangeOverride: (e) => handleTextInput('contactPerson', e.target.value) })}
              {renderField('Contact No.', 'contactNo', { required: true, placeholder: 'Enter 10-digit mobile number', maxLength: 10, inputMode: 'numeric', onChangeOverride: (e) => handleNumberInput('contactNo', e.target.value, 10) })}
              {renderField('Contact E-Mail Id', 'contactEmail', { required: true, type: 'email', placeholder: 'Enter email address' })}
            </div>
          </div>

          <div className="form-section">
            <h3>Income Tax Details</h3>
            <div className="form-grid">
              {renderField('PAN', 'pan', { required: true, disabled: true })}
              {renderField('TAN (Optional)', 'tan', { required: false, placeholder: 'Enter TAN (e.g. ABCD12345E)', maxLength: 10, onChangeOverride: (e) => updateField('tan', e.target.value.toUpperCase()) })}
            </div>
          </div>

          <div className="form-section">
            <h3>GST Details</h3>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.gstNotRegistered}
                  onChange={(e) => updateField('gstNotRegistered', e.target.checked)}
                />
                Not Registered under GST
              </label>
            </div>
            {form.gstNotRegistered ? (
              <div style={{ padding: '14px 16px', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--gray-200)' }}>
                <p style={{ fontSize: '13px', color: 'var(--gray-600)', margin: 0 }}>
                  GST fields are not applicable. You will need to upload a <strong>URD Letter</strong> in the Required Documents section below.
                </p>
              </div>
            ) : (
              <div className="form-grid">
                {renderField('GST No.', 'gstNo', { required: true, placeholder: 'Enter 15-digit GST number', maxLength: 15, onChangeOverride: (e) => updateField('gstNo', e.target.value.toUpperCase()) })}
                {renderField('LUT No.', 'lutNo', { required: true, placeholder: 'Enter LUT number' })}
                {renderField('Year', 'year', { required: true, placeholder: 'Enter year (e.g. 2024-25)' })}
              </div>
            )}
          </div>

          <div className="form-section">
            <h3>MSME Details</h3>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.msmeNotRegistered}
                  onChange={(e) => updateField('msmeNotRegistered', e.target.checked)}
                />
                Not Registered under MSME
              </label>
            </div>
            {form.msmeNotRegistered ? (
              <div style={{ padding: '14px 16px', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--gray-200)' }}>
                <p style={{ fontSize: '13px', color: 'var(--gray-600)', margin: 0 }}>
                  MSME fields are not applicable. You will need to upload an <strong>MSME Declaration</strong> in the Required Documents section below.
                </p>
              </div>
            ) : (
              <div className="form-grid">
                {renderField('MSME Registration No.', 'msmeNo', { required: true, placeholder: 'Enter MSME registration number' })}
                <div className="form-group">
                  <label>Category (Micro/Small/Medium) <span className="required">*</span></label>
                  <select
                    className={`form-control ${errors.msmeCategory ? 'error' : ''}`}
                    value={form.msmeCategory}
                    onChange={(e) => updateField('msmeCategory', e.target.value)}
                  >
                    <option value="">Select Category</option>
                    <option value="Micro">Micro</option>
                    <option value="Small">Small</option>
                    <option value="Medium">Medium</option>
                  </select>
                  {errors.msmeCategory && <p className="error-text">{errors.msmeCategory}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="form-section">
            <h3>Bank Details</h3>
            <div className="form-grid">
              {renderField('Bank Name', 'bankName', { required: true, placeholder: 'Enter bank name', onChangeOverride: (e) => handleTextInput('bankName', e.target.value) })}
              {renderField('Bank A/c No.', 'bankAccountNo', { required: true, placeholder: 'Enter bank account number', maxLength: 18, inputMode: 'numeric', onChangeOverride: (e) => handleNumberInput('bankAccountNo', e.target.value, 18) })}
              {renderField('IFSC Code', 'ifscCode', { required: true, placeholder: 'Enter IFSC (e.g. SBIN0001234)', maxLength: 11, onChangeOverride: (e) => updateField('ifscCode', e.target.value.toUpperCase()) })}
            </div>
          </div>
        </div>

        {/* ── Required Documents (conditional) ── */}
        {(form.gstNotRegistered || form.msmeNotRegistered) && (
          <div className="card" style={{ marginBottom: '24px', border: '2px solid var(--warning)' }}>
            <div className="form-section">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--danger)' }}>*</span> Required Documents
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '20px' }}>
                Based on your selections above, the following documents are <strong>mandatory</strong>. Download the template, fill it, sign it, and upload.
              </p>

              {/* URD Letter Required */}
              {form.gstNotRegistered && (() => {
                const uploaded = attachments.find((a) => a.type === 'URD Letter');
                return (
                  <div style={{
                    padding: '20px',
                    background: uploaded ? 'var(--success-light)' : 'var(--warning-light)',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${uploaded ? 'var(--success)' : 'var(--warning)'}`,
                    marginBottom: form.msmeNotRegistered ? '16px' : '0',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <h4 style={{ fontSize: '15px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {uploaded ? '✅' : '⚠️'} URD Letter (Unregistered Dealer)
                        </h4>
                        <p style={{ fontSize: '13px', color: 'var(--gray-700)', margin: 0 }}>
                          Required because you are not registered under GST. Download the template, fill it with your details, and upload the signed copy.
                        </p>
                        {uploaded && (
                          <div style={{ marginTop: '10px', padding: '8px 12px', background: 'white', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                            <span>📎</span>
                            <strong>{uploaded.renamedName}</strong>
                            <span style={{ color: 'var(--gray-500)' }}>({(uploaded.size / 1024).toFixed(1)} KB)</span>
                            <button
                              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '14px' }}
                              onClick={() => setAttachments((prev) => prev.filter((a) => a.type !== 'URD Letter'))}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <a
                          href="/templates/URD_Letter_Template.pdf"
                          target="_blank"
                          className="btn btn-sm btn-outline"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          Download Template
                        </a>
                        {!uploaded && (
                          <>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => urdFileRef.current?.click()}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              Upload URD Letter
                            </button>
                            <input
                              ref={urdFileRef}
                              type="file"
                              onChange={(e) => handleRequiredDocUpload(e, 'URD Letter')}
                              style={{ display: 'none' }}
                              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                            />
                          </>
                        )}
                      </div>
                    </div>
                    {errors.urdLetter && <p className="error-text" style={{ marginTop: '10px' }}>{errors.urdLetter}</p>}
                  </div>
                );
              })()}

              {/* MSME Declaration Required */}
              {form.msmeNotRegistered && (() => {
                const uploaded = attachments.find((a) => a.type === 'MSME Declaration');
                return (
                  <div style={{
                    padding: '20px',
                    background: uploaded ? 'var(--success-light)' : 'var(--warning-light)',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${uploaded ? 'var(--success)' : 'var(--warning)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <h4 style={{ fontSize: '15px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {uploaded ? '✅' : '⚠️'} MSME Declaration
                        </h4>
                        <p style={{ fontSize: '13px', color: 'var(--gray-700)', margin: 0 }}>
                          Required because you are not registered under MSME. Download the template, fill it with your details, and upload the signed copy.
                        </p>
                        {uploaded && (
                          <div style={{ marginTop: '10px', padding: '8px 12px', background: 'white', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                            <span>📎</span>
                            <strong>{uploaded.renamedName}</strong>
                            <span style={{ color: 'var(--gray-500)' }}>({(uploaded.size / 1024).toFixed(1)} KB)</span>
                            <button
                              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '14px' }}
                              onClick={() => setAttachments((prev) => prev.filter((a) => a.type !== 'MSME Declaration'))}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <a
                          href="/templates/MSME_Declaration_Template.pdf"
                          target="_blank"
                          className="btn btn-sm btn-outline"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          Download Template
                        </a>
                        {!uploaded && (
                          <>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => msmeFileRef.current?.click()}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              Upload Declaration
                            </button>
                            <input
                              ref={msmeFileRef}
                              type="file"
                              onChange={(e) => handleRequiredDocUpload(e, 'MSME Declaration')}
                              style={{ display: 'none' }}
                              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                            />
                          </>
                        )}
                      </div>
                    </div>
                    {errors.msmeDeclaration && <p className="error-text" style={{ marginTop: '10px' }}>{errors.msmeDeclaration}</p>}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Additional Documents ── */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="form-section">
            <h3>Additional Documents</h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '16px' }}>
              Upload supporting documents such as PAN Card, GST Certificate, Cancelled Cheque, etc. (max 5MB each).
            </p>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
                <label>Document Type</label>
                <select
                  className="form-control"
                  value={attachType}
                  onChange={(e) => setAttachType(e.target.value)}
                >
                  {ATTACHMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <button
                  className="btn btn-outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  + Add Document
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileAdd}
                  style={{ display: 'none' }}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                />
              </div>
            </div>

            {attachments.filter((a) => a.type !== 'URD Letter' && a.type !== 'MSME Declaration').length === 0 ? (
              <p style={{ color: 'var(--gray-500)', fontSize: '13px', padding: '20px', textAlign: 'center', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                No additional documents added yet.
              </p>
            ) : (
              attachments
                .map((att, i) => ({ att, originalIndex: i }))
                .filter(({ att }) => att.type !== 'URD Letter' && att.type !== 'MSME Declaration')
                .map(({ att, originalIndex }) => (
                  <div key={originalIndex} className="attachment-item">
                    <div className="file-info">
                      <span>📎</span>
                      <div>
                        <div><strong>{att.renamedName}</strong></div>
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                          Original: {att.originalName} | Type: {att.type} | {(att.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn-icon"
                      onClick={() => removeAttachment(originalIndex)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '40px' }}>
          <button
            className="btn btn-primary"
            style={{ padding: '14px 48px', fontSize: '16px' }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit KYC Form'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VendorFormPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Loading form...</p></div>}>
      <FormContent />
    </Suspense>
  );
}
