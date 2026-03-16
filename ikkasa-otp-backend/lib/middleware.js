/**
 * Shared middleware for all API routes.
 * Handles: CORS, API key auth, phone sanitization.
 */

const ALLOWED_ORIGIN = 'https://ikkasa.com';
const API_SECRET     = process.env.API_SECRET_KEY;

/** Set CORS headers and handle preflight OPTIONS requests. Returns true if request is done. */
export function handleCORS(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // Request handled — caller should return
  }
  return false;
}

/** Validate method is POST. Returns true if invalid (already sent 405). */
export function requirePOST(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }
  return false;
}

/** Validate the shared API key header. Returns true if invalid (already sent 401). */
export function requireAPIKey(req, res) {
  if (!API_SECRET) {
    console.warn('API_SECRET_KEY env var not set — skipping auth check');
    return false;
  }
  const key = req.headers['x-api-key'];
  if (!key || key !== API_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }
  return false;
}

/**
 * Sanitize and validate Indian phone number.
 * Accepts 10-digit number, strips leading 0 or +91/91 if present.
 * Returns cleaned 10-digit string, or null if invalid.
 */
export function sanitizePhone(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let phone = raw.trim().replace(/\s+/g, '');

  // Strip country code variants
  if (phone.startsWith('+91')) phone = phone.slice(3);
  else if (phone.startsWith('91') && phone.length === 12) phone = phone.slice(2);
  else if (phone.startsWith('0')) phone = phone.slice(1);

  // Must be exactly 10 digits, starting with 6–9 (valid Indian mobile)
  if (!/^[6-9]\d{9}$/.test(phone)) return null;
  return phone;
}
