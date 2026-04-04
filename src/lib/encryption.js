const ENCRYPTION_KEY = 'VendorKYC2024SecureKey!@#';
const EXPIRY_DAYS = 4;

function simpleEncrypt(text) {
  const encoded = btoa(
    encodeURIComponent(text)
      .split('')
      .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)))
      .join('')
  );
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function simpleDecrypt(encoded) {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    return decodeURIComponent(
      decoded
        .split('')
        .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)))
        .join('')
    );
  } catch {
    return null;
  }
}

export function generateEncryptedLink(pan, baseUrl = '') {
  const payload = JSON.stringify({
    pan: pan.toUpperCase().trim(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });
  const token = simpleEncrypt(payload);
  return `${baseUrl}/vendor/verify?token=${token}`;
}

export function decryptAndValidateToken(token) {
  const decrypted = simpleDecrypt(token);
  if (!decrypted) return { valid: false, error: 'Invalid link' };

  try {
    const data = JSON.parse(decrypted);
    const now = new Date();
    const expiresAt = new Date(data.expiresAt);

    if (now > expiresAt) {
      return { valid: false, expired: true, error: 'This link has expired', expiresAt: data.expiresAt };
    }

    return { valid: true, expired: false, pan: data.pan, expiresAt: data.expiresAt, createdAt: data.createdAt };
  } catch {
    return { valid: false, error: 'Invalid link format' };
  }
}

export function validatePAN(pan) {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan.toUpperCase().trim());
}
