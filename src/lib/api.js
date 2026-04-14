/**
 * API Service Layer for Vendor KYC
 *
 * Routes to Supabase when configured, falls back to dummy data otherwise.
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabase';

// ─── camelCase <-> snake_case mapping ────────────────────────────────────────

// Map: JS camelCase field → DB snake_case column
const LINK_FIELDS = {
  id: 'id',
  vendorName: 'vendor_name',
  pan: 'pan',
  email: 'email',
  link: 'link',
  shortCode: 'short_code',
  status: 'status',
  createdAt: 'created_at',
  expiresAt: 'expires_at',
};

const SUBMISSION_FIELDS = {
  id: 'id',
  pan: 'pan',
  vendorName: 'vendor_name',
  legalName: 'legal_name',
  tradeName: 'trade_name',
  address: 'address',
  city: 'city',
  district: 'district',
  state: 'state',
  pinCode: 'pin_code',
  contactPerson: 'contact_person',
  contactNo: 'contact_no',
  contactEmail: 'contact_email',
  tan: 'tan',
  gstNo: 'gst_no',
  gstRegType: 'gst_reg_type',
  gstNotRegistered: 'gst_not_registered',
  goodsSent: 'goods_sent',
  lutNo: 'lut_no',
  lutYear: 'lut_year',
  msmeNo: 'msme_no',
  msmeCategory: 'msme_category',
  msmeYear: 'msme_year',
  msmeNotRegistered: 'msme_not_registered',
  bankName: 'bank_name',
  bankAccountNo: 'bank_account_no',
  ifscCode: 'ifsc_code',
  activity: 'activity',
  status: 'status',
  comment: 'comment',
  submittedAt: 'submitted_at',
  reviewedAt: 'reviewed_at',
  viewedAt: 'viewed_at',
};

const ATTACHMENT_FIELDS = {
  id: 'id',
  submissionId: 'submission_id',
  originalName: 'original_name',
  renamedName: 'renamed_name',
  type: 'type',
  size: 'size',
  fileUrl: 'file_url',
  mimeType: 'mime_type',
};

/** Convert a DB row (snake_case) to JS object (camelCase) */
function toClient(row, fieldMap) {
  if (!row) return null;
  const reversed = Object.fromEntries(
    Object.entries(fieldMap).map(([camel, snake]) => [snake, camel])
  );
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = reversed[key] || key;
    result[camelKey] = value;
  }
  return result;
}

/** Convert a JS object (camelCase) to DB row (snake_case) */
function toDB(obj, fieldMap) {
  if (!obj) return null;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = fieldMap[key] || key;
    // Skip fields that aren't in the map (e.g. 'attachments' which is a relation)
    if (fieldMap[key] !== undefined) {
      result[snakeKey] = value;
    }
  }
  return result;
}

// ─── Dummy Data Store (fallback when Supabase not configured) ────────────────

const dummyDB = {
  links: [
    {
      id: 'link_001',
      pan: 'ABCDE1234F',
      link: '/vendor/verify?token=demo_token_1',
      status: 'active',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'link_002',
      pan: 'XYZAB5678C',
      link: '/vendor/verify?token=demo_token_2',
      status: 'submitted',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'link_003',
      pan: 'PQRST9012D',
      link: '/vendor/verify?token=demo_token_3',
      status: 'active',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  submissions: [
    {
      id: 'sub_001',
      pan: 'XYZAB5678C',
      vendorName: 'Acme Technologies Pvt Ltd',
      legalName: 'Acme Technologies Private Limited',
      tradeName: 'AcmeTech',
      address: '42 Industrial Area Phase 2, Sector 62',
      city: 'Noida',
      district: 'Gautam Buddha Nagar',
      pinCode: '201301',
      contactPerson: 'Rajesh Kumar',
      contactNo: '9876543210',
      contactEmail: 'rajesh@acmetech.com',
      tan: 'DELA12345B',
      gstNo: '09XYZAB5678C1Z5',
      gstNotRegistered: false,
      lutNo: 'LUT202400123',
      year: '2024-25',
      msmeNo: 'UDYAM-UP-01-0012345',
      msmeCategory: 'Small',
      bankName: 'State Bank of India',
      bankAccountNo: '123456789012',
      ifscCode: 'SBIN0001234',
      activity: 'Manufacturing',
      attachments: [
        { originalName: 'pan_card.pdf', renamedName: 'PAN_Card_pan_card.pdf', type: 'PAN Card', size: 245000, fileUrl: '', mimeType: 'application/pdf' },
        { originalName: 'gst_cert.pdf', renamedName: 'GST_Certificate_gst_cert.pdf', type: 'GST Certificate', size: 310000, fileUrl: '', mimeType: 'application/pdf' },
      ],
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      comment: '',
      reviewedAt: null,
      viewedAt: null,
    },
    {
      id: 'sub_002',
      pan: 'MNOPQ3456R',
      vendorName: 'Global Services India',
      legalName: 'Global Services India LLP',
      tradeName: 'GSI',
      address: '15 MG Road, Koramangala 5th Block',
      city: 'Bangalore',
      district: 'Bangalore Urban',
      pinCode: '560095',
      contactPerson: 'Priya Sharma',
      contactNo: '8765432109',
      contactEmail: 'priya@globalservices.in',
      tan: 'BLRP09876A',
      gstNo: '29MNOPQ3456R1Z8',
      gstNotRegistered: false,
      lutNo: 'LUT202400456',
      year: '2024-25',
      msmeNo: 'UDYAM-KA-02-0067890',
      msmeCategory: 'Micro',
      bankName: 'HDFC Bank',
      bankAccountNo: '987654321098',
      ifscCode: 'HDFC0001234',
      activity: 'Service',
      attachments: [
        { originalName: 'pan.jpg', renamedName: 'PAN_Card_pan.jpg', type: 'PAN Card', size: 180000, fileUrl: '', mimeType: 'image/jpeg' },
      ],
      submittedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'approved',
      comment: 'All documents verified. Approved.',
      reviewedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      viewedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'sub_003',
      pan: 'DEFGH7890K',
      vendorName: 'Sunrise Trading Co',
      legalName: 'Sunrise Trading Company',
      tradeName: 'STC',
      address: '78 Nehru Place, Block B, Ring Road',
      city: 'New Delhi',
      district: 'South Delhi',
      pinCode: '110019',
      contactPerson: 'Amit Verma',
      contactNo: '7654321098',
      contactEmail: 'amit@sunrisetrading.com',
      tan: 'DELV54321C',
      gstNo: '',
      gstNotRegistered: true,
      lutNo: 'LUT202400789',
      year: '2024-25',
      msmeNo: 'UDYAM-DL-03-0034567',
      msmeCategory: 'Medium',
      bankName: 'ICICI Bank',
      bankAccountNo: '456789012345',
      ifscCode: 'ICIC0001234',
      activity: 'Trading',
      attachments: [
        { originalName: 'urd_letter.pdf', renamedName: 'URD_Letter_urd_letter.pdf', type: 'URD Letter', size: 290000, fileUrl: '', mimeType: 'application/pdf' },
        { originalName: 'msme_cert.pdf', renamedName: 'MSME_Certificate_msme_cert.pdf', type: 'MSME Certificate', size: 420000, fileUrl: '', mimeType: 'application/pdf' },
      ],
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'viewed',
      comment: '',
      reviewedAt: null,
      viewedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

// Helpers for dummy mode
function delay(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Generate a short 8-char alphanumeric code for URLs
function generateShortCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Links API ───────────────────────────────────────────────────────────────

export async function fetchLinks() {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('vkyc_ad_links')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map((row) => toClient(row, LINK_FIELDS));
  }

  // Dummy mode
  await delay();
  return [...dummyDB.links];
}

export async function createLinks(newLinks) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const dbRows = newLinks.map((link) => toDB(link, LINK_FIELDS));
    const { data, error } = await supabase
      .from('vkyc_ad_links')
      .insert(dbRows)
      .select();
    if (error) throw new Error(error.message);
    return data.map((row) => toClient(row, LINK_FIELDS));
  }

  // Dummy mode
  await delay();
  const created = newLinks.map((link) => ({
    id: generateId('link'),
    ...link,
    shortCode: link.shortCode || generateShortCode(),
    status: link.status || 'active',
    createdAt: link.createdAt || new Date().toISOString(),
  }));
  dummyDB.links.push(...created);
  return created;
}

export async function updateLinkStatus(pan, status) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('vkyc_ad_links')
      .update({ status })
      .eq('pan', pan)
      .select();
    if (error) throw new Error(error.message);
    return data.map((row) => toClient(row, LINK_FIELDS));
  }

  // Dummy mode
  await delay();
  dummyDB.links = dummyDB.links.map((l) =>
    l.pan === pan ? { ...l, status } : l
  );
  return dummyDB.links.filter((l) => l.pan === pan);
}

// ─── Submissions API ─────────────────────────────────────────────────────────

export async function fetchSubmissions() {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();

    // Fetch submissions
    const { data: subsData, error: subsError } = await supabase
      .from('vkyc_ad_submissions')
      .select('*')
      .order('submitted_at', { ascending: false });
    if (subsError) throw new Error(subsError.message);

    // Fetch all attachments
    const subIds = subsData.map((s) => s.id);
    let attachmentsMap = {};

    if (subIds.length > 0) {
      try {
        const { data: attData, error: attError } = await supabase
          .from('vkyc_ad_attachments')
          .select('*')
          .in('submission_id', subIds);
        if (!attError && attData) {
          for (const att of attData) {
            const subId = att.submission_id;
            if (!attachmentsMap[subId]) attachmentsMap[subId] = [];
            attachmentsMap[subId].push(toClient(att, ATTACHMENT_FIELDS));
          }
        }
      } catch (attErr) {
        // Non-critical: return submissions without attachments
        console.error('[fetchSubmissions] Failed to fetch attachments:', attErr.message);
      }
    }

    // Combine submissions with their attachments
    return subsData.map((row) => {
      const sub = toClient(row, SUBMISSION_FIELDS);
      sub.attachments = attachmentsMap[row.id] || [];
      return sub;
    });
  }

  // Dummy mode
  await delay();
  return [...dummyDB.submissions];
}

export async function createSubmission(submission) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { attachments, ...rest } = submission;
    const pan = (submission.pan || '').toUpperCase().trim();

    // ── Step 1: Upload ALL files to storage FIRST (before any DB writes) ──
    // Folder structure: PAN_VendorName/filename
    const folderName = `${pan}_${(submission.vendorName || 'vendor').replace(/[^a-zA-Z0-9]/g, '_')}`;
    const uploadedFiles = []; // Track uploaded files for rollback

    if (attachments?.length > 0) {
      for (const att of attachments) {
        if (!att.dataUrl) continue;

        try {
          const { publicUrl, storagePath } = await uploadAttachment(
            att.dataUrl,
            att.renamedName,
            att.mimeType,
            folderName
          );
          uploadedFiles.push({
            ...att,
            fileUrl: publicUrl,
            storagePath,
          });
        } catch (uploadErr) {
          // Rollback: delete all files uploaded so far (safe — won't mask error)
          console.error('[createSubmission] File upload failed, rolling back:', uploadErr.message);
          try {
            if (uploadedFiles.length > 0) {
              const pathsToDelete = uploadedFiles.map((f) => f.storagePath);
              await supabase.storage.from('vkyc_ad_documents').remove(pathsToDelete);
            }
          } catch (rollbackErr) {
            console.error('[createSubmission] Rollback cleanup failed:', rollbackErr.message);
          }
          throw new Error(`File upload failed for "${att.renamedName}": ${uploadErr.message}`);
        }
      }
    }

    // ── Step 2: Insert submission into DB ──
    const dbRow = toDB(rest, SUBMISSION_FIELDS);
    const { data: subData, error: subError } = await supabase
      .from('vkyc_ad_submissions')
      .insert(dbRow)
      .select()
      .single();

    if (subError) {
      // Rollback: delete all uploaded files (safe)
      try {
        if (uploadedFiles.length > 0) {
          const pathsToDelete = uploadedFiles.map((f) => f.storagePath);
          await supabase.storage.from('vkyc_ad_documents').remove(pathsToDelete);
        }
      } catch (rollbackErr) {
        console.error('[createSubmission] Rollback cleanup failed:', rollbackErr.message);
      }
      throw new Error(`Submission save failed: ${subError.message}`);
    }

    // ── Step 3: Insert attachment records into DB ──
    const savedAttachments = [];
    if (uploadedFiles.length > 0) {
      const attRows = uploadedFiles.map((f) => ({
        submission_id: subData.id,
        original_name: f.originalName,
        renamed_name: f.renamedName,
        type: f.type,
        size: f.size,
        file_url: f.fileUrl,
        mime_type: f.mimeType,
      }));

      const { data: attData, error: attError } = await supabase
        .from('vkyc_ad_attachments')
        .insert(attRows)
        .select();

      if (attError) {
        // Rollback: delete submission + uploaded files (safe)
        try {
          await supabase.from('vkyc_ad_submissions').delete().eq('id', subData.id);
          const pathsToDelete = uploadedFiles.map((f) => f.storagePath);
          await supabase.storage.from('vkyc_ad_documents').remove(pathsToDelete);
        } catch (rollbackErr) {
          console.error('[createSubmission] Rollback cleanup failed:', rollbackErr.message);
        }
        throw new Error(`Attachment save failed: ${attError.message}`);
      }

      for (const row of attData) {
        savedAttachments.push(toClient(row, ATTACHMENT_FIELDS));
      }
    }

    // ── Step 4: Mark link as submitted (non-critical — don't fail the whole submission) ──
    try {
      await supabase
        .from('vkyc_ad_links')
        .update({ status: 'submitted' })
        .eq('pan', pan);
    } catch (linkErr) {
      console.error('[createSubmission] Failed to update link status (non-critical):', linkErr.message);
    }

    const result = toClient(subData, SUBMISSION_FIELDS);
    result.attachments = savedAttachments;
    return result;
  }

  // Dummy mode
  await delay();
  const newSubmission = {
    id: generateId('sub'),
    ...submission,
    submittedAt: submission.submittedAt || new Date().toISOString(),
    status: 'pending',
    comment: '',
    reviewedAt: null,
    viewedAt: null,
  };
  dummyDB.submissions.push(newSubmission);
  dummyDB.links = dummyDB.links.map((l) =>
    l.pan === submission.pan ? { ...l, status: 'submitted' } : l
  );
  return newSubmission;
}

export async function updateSubmissionStatus(id, status, comment = '') {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const updates = {
      status,
      reviewed_at: new Date().toISOString(),
    };
    if (comment) updates.comment = comment;
    if (status !== 'pending') {
      updates.viewed_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('vkyc_ad_submissions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toClient(data, SUBMISSION_FIELDS);
  }

  // Dummy mode
  await delay();
  dummyDB.submissions = dummyDB.submissions.map((s) =>
    s.id === id
      ? {
          ...s,
          status,
          comment: comment || s.comment,
          reviewedAt: new Date().toISOString(),
          viewedAt: s.viewedAt || (status !== 'pending' ? new Date().toISOString() : null),
        }
      : s
  );
  return dummyDB.submissions.find((s) => s.id === id);
}

export async function markSubmissionViewed(id) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('vkyc_ad_submissions')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .single();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data ? toClient(data, SUBMISSION_FIELDS) : null;
  }

  // Dummy mode
  await delay();
  dummyDB.submissions = dummyDB.submissions.map((s) =>
    s.id === id && s.status === 'pending'
      ? { ...s, status: 'viewed', viewedAt: new Date().toISOString() }
      : s
  );
  return dummyDB.submissions.find((s) => s.id === id);
}

// ─── File Upload (Supabase Storage Bucket: kyc-documents) ───────────────────

/**
 * Upload a file to Supabase Storage
 *
 * Folder structure in bucket:
 *   vkyc_ad_documents/
 *     └── ABCDE1234F_Acme_Technologies/
 *           ├── 1712345678_PAN_Card_pan.pdf
 *           ├── 1712345679_GST_Certificate_gst.pdf
 *           └── ...
 *
 * @param {string} dataUrl - Base64 data URL of the file
 * @param {string} renamedName - Renamed file name with type prefix
 * @param {string} mimeType - MIME type of the file
 * @param {string} folderName - Folder name (PAN_VendorName)
 * @returns {string} Public URL of the uploaded file
 */
export async function uploadAttachment(dataUrl, renamedName, mimeType, folderName = '') {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();

    // Convert base64 dataUrl to Blob
    const base64Data = dataUrl.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    // Upload to storage bucket inside vendor-specific folder
    const fileName = `${Date.now()}_${renamedName}`;
    const filePath = folderName ? `${folderName}/${fileName}` : fileName;

    const { error } = await supabase.storage
      .from('vkyc_ad_documents')
      .upload(filePath, blob, {
        contentType: mimeType,
        upsert: false,
      });
    if (error) throw new Error(error.message);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('vkyc_ad_documents')
      .getPublicUrl(filePath);

    return { publicUrl: urlData.publicUrl, storagePath: filePath };
  }

  // Dummy mode
  await delay(100);
  const folder = folderName || 'misc';
  return {
    publicUrl: `https://placeholder.supabase.co/storage/vkyc_ad_documents/${folder}/${renamedName}`,
    storagePath: `${folder}/${renamedName}`,
  };
}

// ─── Check if submission exists for PAN ──────────────────────────────────────

export async function checkSubmissionByPan(pan) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('vkyc_ad_submissions')
      .select('id, status')
      .eq('pan', pan)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  // Dummy mode
  await delay(100);
  const found = dummyDB.submissions.find((s) => s.pan === pan);
  return found ? { id: found.id, status: found.status } : null;
}

// ─── Lookup link by short code ───────────────────────────────────────────────

export async function findLinkByShortCode(shortCode) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('vkyc_ad_links')
      .select('link')
      .eq('short_code', shortCode)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.link || null;
  }

  // Dummy mode
  const found = dummyDB.links.find((l) => l.shortCode === shortCode);
  return found?.link || null;
}
