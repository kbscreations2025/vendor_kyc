'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { decryptAndValidateToken } from '@/lib/encryption';
import { useKyc } from '@/context/KycContext';
import { saveDraft, loadDraft, clearDraft } from '@/lib/formCache';

// Dropdown types for additional documents (required docs have their own upload section)
const ATTACHMENT_TYPES = [
  'Aadhaar Card',
  'Cancelled Cheque',
  'Bank Statement',
  'Incorporation Certificate',
  'Other',
];

// --- Validation helpers ---
function isOnlyLettersSpaces(val) {
  return /^[A-Za-z\s]+$/.test(val);
}
function isValidPlaceName(val) {
  return /^[A-Za-z0-9\s.\-()&,']+$/.test(val);
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
function isAlphanumeric(val) {
  return /^[A-Za-z0-9\s]+$/.test(val.trim());
}
function isValidMSME(val) {
  return /^[A-Za-z0-9-]{1,19}$/.test(val.trim());
}
// Generate financial year options (current + past 2 years)
function getFinancialYears() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Financial year starts April. If Jan-Mar, current FY started previous year.
  const fyStart = month >= 3 ? currentYear : currentYear - 1;
  const years = [];
  for (let i = 0; i < 3; i++) {
    const start = fyStart - i;
    years.push(`${start}-${String(start + 1).slice(2)}`);
  }
  return years;
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
    legalName: '',
    tradeName: '',
    address: '',
    city: '',
    district: '',
    state: '',
    pinCode: '',
    contactPerson: '',
    contactNo: '',
    contactEmail: '',
    pan: '',
    tan: '',
    gstNo: '',
    gstRegType: '',
    gstNotRegistered: false,
    goodsSent: false,
    lutNo: '',
    lutYear: '',
    msmeNo: '',
    msmeCategory: '',
    msmeYear: '',
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
  const [consent, setConsent] = useState(false);

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
    // Skip re-checking after we've already submitted successfully in this session
    if (submitted || tokenData) return;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, submissions.length]);

  const updateField = (field, value) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };

      // When GST not registered is checked → clear GST fields
      if (field === 'gstNotRegistered' && value === true) {
        updated.gstNo = '';
        updated.gstRegType = '';
        updated.goodsSent = false;
        updated.lutNo = '';
        updated.lutYear = '';
      }

      // When goods sent unchecked → clear LUT fields
      if (field === 'goodsSent' && value === false) {
        updated.lutNo = '';
        updated.lutYear = '';
      }

      // When MSME not registered is checked → clear MSME fields
      if (field === 'msmeNotRegistered' && value === true) {
        updated.msmeNo = '';
        updated.msmeCategory = '';
        updated.msmeYear = '';
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

  // Allow letters, numbers, spaces, and common punctuation for place names
  const handlePlaceInput = (field, value) => {
    const cleaned = value.replace(/[^A-Za-z0-9\s.\-()&,']/g, '');
    updateField(field, cleaned);
  };

  // Pincode lookup state
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState('');
  const [postOffices, setPostOffices] = useState([]);
  const [selectedPO, setSelectedPO] = useState('');
  const [addressPrefilled, setAddressPrefilled] = useState(false);

  const handlePincodeChange = async (value) => {
    const digits = value.replace(/[^0-9]/g, '');
    if (digits.length > 6) return;
    updateField('pinCode', digits);
    setPincodeError('');
    setPostOffices([]);
    setSelectedPO('');
    setAddressPrefilled(false);

    if (digits.length === 6) {
      setPincodeLoading(true);
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${digits}`);
        const data = await res.json();
        if (data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
          const offices = data[0].PostOffice;
          setPostOffices(offices);
          // Auto-select first one
          const po = offices[0];
          setSelectedPO(po.Name);
          setForm((prev) => ({
            ...prev,
            city: po.Block && po.Block !== 'NA' ? po.Block : po.Name,
            district: po.District,
            state: po.State,
          }));
          setErrors((prev) => {
            const next = { ...prev };
            delete next.city;
            delete next.district;
            delete next.state;
            delete next.pinCode;
            return next;
          });
          setAddressPrefilled(true);
        } else {
          setPincodeError('Invalid PIN code — no data found');
          setForm((prev) => ({ ...prev, city: '', district: '', state: '' }));
        }
      } catch {
        setPincodeError('Failed to fetch pincode data');
      } finally {
        setPincodeLoading(false);
      }
    } else {
      setForm((prev) => ({ ...prev, city: '', district: '', state: '' }));
    }
  };

  const handlePOSelect = (poName) => {
    setSelectedPO(poName);
    const po = postOffices.find((p) => p.Name === poName);
    if (po) {
      setForm((prev) => ({
        ...prev,
        city: po.Block && po.Block !== 'NA' ? po.Block : po.Name,
        district: po.District,
        state: po.State,
      }));
    }
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

    // Clear related error
    const errorKeyMap = {
      'URD Letter': 'urdLetter',
      'MSME Declaration': 'msmeDeclaration',
      'PAN Card': 'attPan',
      'GST Certificate': 'attGst',
      'MSME Certificate': 'attMsme',
      'LUT Certificate': 'attLut',
    };
    const errKey = errorKeyMap[docType];
    if (errKey && errors[errKey]) {
      setErrors((prev) => { const next = { ...prev }; delete next[errKey]; return next; });
    }

    e.target.value = '';
  };

  const validate = () => {
    const errs = {};

    // ── Basic Information ──
    if (!form.legalName.trim()) errs.legalName = 'Legal Name is required';
    if (!form.tradeName.trim()) errs.tradeName = 'Trade Name is required';

    // ── Address ──
    if (!form.address.trim()) errs.address = 'Address is required';
    else if (form.address.trim().length < 10) errs.address = 'Address must be at least 10 characters';

    if (!form.city.trim()) errs.city = 'City is required';
    else if (!isValidPlaceName(form.city.trim())) errs.city = 'Invalid city name';

    if (!form.district.trim()) errs.district = 'District is required';
    else if (!isValidPlaceName(form.district.trim())) errs.district = 'Invalid district name';

    if (!form.state.trim()) errs.state = 'State is required';
    else if (!isValidPlaceName(form.state.trim())) errs.state = 'Invalid state name';

    if (!form.pinCode.trim()) errs.pinCode = 'PIN Code is required';
    else if (!isValidPIN(form.pinCode)) errs.pinCode = 'Enter valid 6-digit PIN code';

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
      if (!form.gstRegType) errs.gstRegType = 'Type of Registration is required';
      if (!form.gstNo.trim()) errs.gstNo = 'GST No. is required (or mark as not registered)';
      else if (!isValidGST(form.gstNo)) errs.gstNo = 'Enter valid 15-digit GST number (no special characters)';

      // LUT is conditional on "Goods Sent" checkbox
      if (form.goodsSent) {
        if (!form.lutNo.trim()) errs.lutNo = 'LUT No. is required when goods are sent';
        if (!form.lutYear) errs.lutYear = 'LUT Year is required';
      }
    } else {
      const hasUrdLetter = attachments.some((a) => a.type === 'URD Letter');
      if (!hasUrdLetter) {
        errs.urdLetter = 'URD Letter attachment is required when GST is not registered. Please download the template, fill it, and upload.';
      }
    }

    // ── MSME ──
    if (!form.activity) errs.activity = 'Activity is required';

    if (!form.msmeNotRegistered) {
      if (!form.msmeNo.trim()) errs.msmeNo = 'MSME No. is required (or mark as not registered)';
      else if (!isValidMSME(form.msmeNo)) errs.msmeNo = 'MSME No. must be max 19 characters (letters, numbers, hyphens only)';
      if (!form.msmeCategory) errs.msmeCategory = 'MSME Category is required';
      if (!form.msmeYear) errs.msmeYear = 'MSME Year is required';
    } else {
      const hasMsmeDeclaration = attachments.some((a) => a.type === 'MSME Declaration');
      if (!hasMsmeDeclaration) {
        errs.msmeDeclaration = 'MSME Declaration attachment is required when MSME is not registered. Please download the template, fill it, and upload.';
      }
    }

    // ── Required Attachments based on filled fields ──
    // PAN is always required → PAN Card attachment mandatory
    if (form.pan.trim()) {
      if (!attachments.some((a) => a.type === 'PAN Card')) {
        errs.attPan = 'PAN Card attachment is required';
      }
    }
    // GST filled → GST Certificate required
    if (!form.gstNotRegistered && form.gstNo.trim()) {
      if (!attachments.some((a) => a.type === 'GST Certificate')) {
        errs.attGst = 'GST Certificate attachment is required';
      }
    }
    // MSME filled → MSME Certificate required
    if (!form.msmeNotRegistered && form.msmeNo.trim()) {
      if (!attachments.some((a) => a.type === 'MSME Certificate')) {
        errs.attMsme = 'MSME Certificate attachment is required';
      }
    }
    // LUT filled → LUT Certificate required
    if (!form.gstNotRegistered && form.goodsSent && form.lutNo.trim()) {
      if (!attachments.some((a) => a.type === 'LUT Certificate')) {
        errs.attLut = 'LUT Certificate attachment is required';
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
        vendorName: form.tradeName.trim() || form.legalName.trim(),
        pan: form.pan.toUpperCase().trim(),
        tan: form.tan.toUpperCase().trim(),
        gstNo: form.gstNo.toUpperCase().trim(),
        msmeNo: form.msmeNo.toUpperCase().trim(),
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

      // Notify admin via email (fire-and-forget — don't block user on failure)
      fetch('/api/notify-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName: submission.vendorName,
          pan: submission.pan,
          tradeName: submission.tradeName,
          contactEmail: submission.contactEmail,
          contactNo: submission.contactNo,
          submittedAt: submission.submittedAt,
          reviewUrl: `${window.location.origin}/admin/review`,
        }),
      }).catch((err) => console.error('Admin notification failed:', err));
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
            <img src="/LogoSys.jpg" alt="KBS Logo" style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'contain', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
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
            <img src="/LogoSys.jpg" alt="KBS Logo" style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'contain', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
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
          <img src="/LogoSys.jpg" alt="KBS Logo" style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'contain', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
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
          <img src="/LogoSys.jpg" alt="KBS Logo" style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'contain', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
          <h1 style={{ fontSize: '22px', marginBottom: '8px', color: 'var(--success)' }}>KYC Submitted Successfully!</h1>
          <p style={{ color: 'var(--gray-600)' }}>
            Your KYC form has been submitted to KBS for review. The admin will review your submission and update the status.
            This link is now expired.
          </p>
          <div style={{ marginTop: '20px', padding: '16px', background: 'var(--primary-light)', borderRadius: 'var(--radius)', border: '1px solid var(--primary)' }}>
            <p style={{ fontSize: '14px', color: 'var(--gray-800)', marginBottom: '4px' }}>
              <strong>Re-KYC Due In:</strong>{' '}
              {(() => {
                const reKycDate = new Date();
                reKycDate.setFullYear(reKycDate.getFullYear() + 3);
                const now = new Date();
                const diffDays = Math.ceil((reKycDate - now) / (1000 * 60 * 60 * 24));
                const years = Math.floor(diffDays / 365);
                const months = Math.floor((diffDays % 365) / 30);
                const days = diffDays % 30;
                return `${years} year(s), ${months} month(s), ${days} day(s)`;
              })()}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '4px' }}>
              Your next KYC renewal is due on{' '}
              <strong>{(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 3); return d.toLocaleDateString(); })()}</strong>
            </p>
          </div>
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
          <img
            src="/LogoSys.jpg"
            alt="KBS Logo"
            style={{ width: '72px', height: '72px', borderRadius: '12px', objectFit: 'contain', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          />
          <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Vendor KYC Form</h1>
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
              {renderField('Legal Name', 'legalName', { required: true, placeholder: 'Enter legal name of the business' })}
              {renderField('Trade Name', 'tradeName', { required: true, placeholder: 'Enter trade / brand name' })}
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
              <div className="form-group">
                <label>PIN Code <span className="required">*</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className={`form-control ${errors.pinCode || pincodeError ? 'error' : ''}`}
                    value={form.pinCode}
                    onChange={(e) => handlePincodeChange(e.target.value)}
                    placeholder="Enter 6-digit PIN"
                    maxLength={6}
                    inputMode="numeric"
                  />
                  {pincodeLoading && (
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--gray-500)' }}>
                      Loading...
                    </span>
                  )}
                </div>
                {errors.pinCode && <p className="error-text">{errors.pinCode}</p>}
                {pincodeError && <p className="error-text">{pincodeError}</p>}
              </div>
              {postOffices.length > 1 && (
                <div className="form-group">
                  <label>Post Office / Area <span className="required">*</span></label>
                  <select
                    className="form-control"
                    value={selectedPO}
                    onChange={(e) => handlePOSelect(e.target.value)}
                  >
                    {postOffices.map((po) => (
                      <option key={po.Name} value={po.Name}>
                        {po.Name} ({po.BranchType})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {renderField('City', 'city', { required: true, placeholder: 'Auto-filled from PIN code', disabled: addressPrefilled, onChangeOverride: (e) => handlePlaceInput('city', e.target.value) })}
              {renderField('District', 'district', { required: true, placeholder: 'Auto-filled from PIN code', disabled: addressPrefilled, onChangeOverride: (e) => handlePlaceInput('district', e.target.value) })}
              {renderField('State', 'state', { required: true, placeholder: 'Auto-filled from PIN code', disabled: addressPrefilled, onChangeOverride: (e) => handlePlaceInput('state', e.target.value) })}
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
              <>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Type of Registration <span className="required">*</span></label>
                    <select
                      className={`form-control ${errors.gstRegType ? 'error' : ''}`}
                      value={form.gstRegType}
                      onChange={(e) => updateField('gstRegType', e.target.value)}
                    >
                      <option value="">Select Type</option>
                      <option value="Regular">Regular</option>
                      <option value="Composition">Composition</option>
                      <option value="SEZ">SEZ</option>
                    </select>
                    {errors.gstRegType && <p className="error-text">{errors.gstRegType}</p>}
                  </div>
                  {renderField('GST No.', 'gstNo', { required: true, placeholder: 'Enter 15-digit GST number', maxLength: 15, onChangeOverride: (e) => updateField('gstNo', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')) })}
                </div>
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.goodsSent}
                      onChange={(e) => updateField('goodsSent', e.target.checked)}
                    />
                    If goods or services supply to SEZ (LUT applicable)
                  </label>
                </div>
                {form.goodsSent && (
                  <div className="form-grid" style={{ marginTop: '12px' }}>
                    {renderField('LUT No.', 'lutNo', { required: true, placeholder: 'Enter LUT number' })}
                    <div className="form-group">
                      <label>LUT Year <span className="required">*</span></label>
                      <select
                        className={`form-control ${errors.lutYear ? 'error' : ''}`}
                        value={form.lutYear}
                        onChange={(e) => updateField('lutYear', e.target.value)}
                      >
                        <option value="">Select Financial Year</option>
                        {getFinancialYears().map((fy) => (
                          <option key={fy} value={fy}>{fy}</option>
                        ))}
                      </select>
                      {errors.lutYear && <p className="error-text">{errors.lutYear}</p>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="form-section">
            <h3>MSME Details</h3>
            <div className="form-grid" style={{ marginBottom: '16px' }}>
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
                {renderField('MSME Registration No.', 'msmeNo', { required: true, placeholder: 'e.g. UDYAM-XX-00-0000000', maxLength: 19, onChangeOverride: (e) => updateField('msmeNo', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')) })}
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
                <div className="form-group">
                  <label>MSME Year <span className="required">*</span></label>
                  <select
                    className={`form-control ${errors.msmeYear ? 'error' : ''}`}
                    value={form.msmeYear}
                    onChange={(e) => updateField('msmeYear', e.target.value)}
                  >
                    <option value="">Select Financial Year</option>
                    {getFinancialYears().map((fy) => (
                      <option key={fy} value={fy}>{fy}</option>
                    ))}
                  </select>
                  {errors.msmeYear && <p className="error-text">{errors.msmeYear}</p>}
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

        {/* ── Required Document Uploads ── */}
        {(() => {
          // Determine which required docs are needed based on form values
          const REQUIRED_DOCS = [];

          // PAN is always filled (pre-filled) → PAN Card always required
          if (form.pan.trim()) {
            REQUIRED_DOCS.push({ type: 'PAN Card', label: 'PAN Card Copy', reason: 'PAN number is provided', errorKey: 'attPan' });
          }

          // GST filled → GST Certificate required
          if (!form.gstNotRegistered && form.gstNo.trim()) {
            REQUIRED_DOCS.push({ type: 'GST Certificate', label: 'GST Certificate', reason: 'GST number is provided', errorKey: 'attGst' });
          }

          // GST not registered → URD Letter required (with template)
          if (form.gstNotRegistered) {
            REQUIRED_DOCS.push({ type: 'URD Letter', label: 'URD Letter (Unregistered Dealer)', reason: 'Not registered under GST', errorKey: 'urdLetter', templateUrl: '/templates/URD_Letter_Template.pdf' });
          }

          // LUT filled → LUT Certificate required
          if (!form.gstNotRegistered && form.goodsSent && form.lutNo.trim()) {
            REQUIRED_DOCS.push({ type: 'LUT Certificate', label: 'LUT Certificate', reason: 'LUT number is provided', errorKey: 'attLut' });
          }

          // MSME filled → MSME Certificate required
          if (!form.msmeNotRegistered && form.msmeNo.trim()) {
            REQUIRED_DOCS.push({ type: 'MSME Certificate', label: 'MSME Certificate', reason: 'MSME number is provided', errorKey: 'attMsme' });
          }

          // MSME not registered → MSME Declaration required (with template)
          if (form.msmeNotRegistered) {
            REQUIRED_DOCS.push({ type: 'MSME Declaration', label: 'MSME Declaration', reason: 'Not registered under MSME', errorKey: 'msmeDeclaration', templateUrl: '/templates/MSME_Declaration_Template.pdf' });
          }

          if (REQUIRED_DOCS.length === 0) return null;

          return (
            <div className="card" style={{ marginBottom: '24px', border: '2px solid var(--primary)' }}>
              <div className="form-section">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--danger)' }}>*</span> Required Documents
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '20px' }}>
                  Based on the information you provided, the following documents are <strong>mandatory</strong>. Upload each one to proceed.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {REQUIRED_DOCS.map((doc) => {
                    const uploaded = attachments.find((a) => a.type === doc.type);
                    return (
                      <div key={doc.type} style={{
                        padding: '16px',
                        background: uploaded ? 'var(--success-light)' : 'var(--gray-50)',
                        borderRadius: 'var(--radius)',
                        border: `1px solid ${uploaded ? 'var(--success)' : errors[doc.errorKey] ? 'var(--danger)' : 'var(--gray-200)'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                          <div style={{ flex: 1, minWidth: '180px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--gray-900)' }}>
                              {uploaded ? '✅' : '📄'} {doc.label}
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--gray-500)', margin: '4px 0 0' }}>
                              {doc.reason}
                            </p>
                            {uploaded && (
                              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--gray-600)' }}>
                                <span>📎</span> {uploaded.renamedName} ({(uploaded.size / 1024).toFixed(1)} KB)
                                <button
                                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
                                  onClick={() => setAttachments((prev) => prev.filter((a) => a.type !== doc.type))}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {doc.templateUrl && (
                              <a href={doc.templateUrl} target="_blank" className="btn btn-sm btn-outline" style={{ whiteSpace: 'nowrap' }}>
                                Template
                              </a>
                            )}
                            {!uploaded && (
                              <label className="btn btn-sm btn-primary" style={{ whiteSpace: 'nowrap', cursor: 'pointer', margin: 0 }}>
                                Upload
                                <input
                                  type="file"
                                  onChange={(e) => handleRequiredDocUpload(e, doc.type)}
                                  style={{ display: 'none' }}
                                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                />
                              </label>
                            )}
                          </div>
                        </div>
                        {errors[doc.errorKey] && <p className="error-text" style={{ marginTop: '8px' }}>{errors[doc.errorKey]}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Additional Documents ── */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="form-section">
            <h3>Additional Documents</h3>
            <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '16px' }}>
              Upload any other supporting documents (Aadhaar, Cancelled Cheque, Bank Statement, etc.). Max 5MB each.
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

            {(() => {
              const REQUIRED_TYPES = ['PAN Card', 'GST Certificate', 'URD Letter', 'LUT Certificate', 'MSME Certificate', 'MSME Declaration'];
              const additionalAtts = attachments
                .map((att, i) => ({ att, originalIndex: i }))
                .filter(({ att }) => !REQUIRED_TYPES.includes(att.type));

              return additionalAtts.length === 0 ? (
                <p style={{ color: 'var(--gray-500)', fontSize: '13px', padding: '20px', textAlign: 'center', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
                  No additional documents added yet.
                </p>
              ) : (
                additionalAtts.map(({ att, originalIndex }) => (
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
                    <button className="btn-icon" onClick={() => removeAttachment(originalIndex)} title="Remove">✕</button>
                  </div>
                ))
              );
            })()}
          </div>
        </div>

        {/* Declaration & Consent */}
        <div className="card" style={{ marginBottom: '24px', border: consent ? '1px solid var(--success)' : '1px solid var(--gray-300)' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              id="consent-checkbox"
              style={{ marginTop: '4px', width: '18px', height: '18px', flexShrink: 0, cursor: 'pointer' }}
            />
            <label htmlFor="consent-checkbox" style={{ fontSize: '13px', color: 'var(--gray-700)', lineHeight: '1.6', cursor: 'pointer' }}>
              I hereby voluntarily consent to provide my Know Your Customer (KYC) details, including identity and address proof, to <strong>KBS CREATIONS</strong> for the purpose of verification and compliance with applicable regulatory requirements. I confirm that the information and documents submitted by me are <strong>true, accurate, and up to date</strong> to the best of my knowledge.
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '40px' }}>
          <button
            className="btn btn-primary"
            style={{ padding: '14px 48px', fontSize: '16px' }}
            onClick={handleSubmit}
            disabled={submitting || !consent}
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
