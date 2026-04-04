/**
 * Form Cache Utility
 *
 * Auto-saves non-confidential form fields to sessionStorage so that
 * if a user navigates away or refreshes without submitting, their
 * progress is restored.
 *
 * Confidential fields (bank details, PAN, TAN, etc.) are EXCLUDED.
 */

const CACHE_KEY = 'vendor_kyc_form_draft';

// Fields that should NOT be cached (confidential/sensitive data)
const CONFIDENTIAL_FIELDS = new Set([
  'pan',
  'tan',
  'gstNo',
  'bankName',
  'bankAccountNo',
  'ifscCode',
  'msmeNo',
]);

/**
 * Save non-confidential form data to sessionStorage
 */
export function saveDraft(formData) {
  if (typeof window === 'undefined') return;

  try {
    const safeDraft = {};
    for (const [key, value] of Object.entries(formData)) {
      if (!CONFIDENTIAL_FIELDS.has(key)) {
        safeDraft[key] = value;
      }
    }
    safeDraft._savedAt = new Date().toISOString();
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(safeDraft));
  } catch {
    // sessionStorage might be full or disabled - fail silently
  }
}

/**
 * Load cached draft from sessionStorage
 * Returns null if no draft exists or it's older than 24 hours
 */
export function loadDraft() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const draft = JSON.parse(raw);

    // Expire drafts older than 24 hours
    if (draft._savedAt) {
      const savedAt = new Date(draft._savedAt);
      const hoursOld = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);
      if (hoursOld > 24) {
        clearDraft();
        return null;
      }
    }

    delete draft._savedAt;
    return draft;
  } catch {
    return null;
  }
}

/**
 * Clear the cached draft (call after successful submission)
 */
export function clearDraft() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // fail silently
  }
}

/**
 * Check if a cached draft exists
 */
export function hasDraft() {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(CACHE_KEY) !== null;
  } catch {
    return false;
  }
}
