import { handleCORS, requirePOST, requireAPIKey, sanitizePhone } from '../lib/middleware.js';
import { getOTP, incrementOTPAttempts, deleteOTP, acquireLock, releaseLock } from '../lib/redis.js';
import {
  findCustomerByPhone,
  isPhoneLoginCustomer,
  createPhoneCustomer,
  setCustomerTempPassword,
} from '../lib/shopify.js';
import { randomBytes } from 'crypto';

export default async function handler(req, res) {
  // 1. CORS + preflight
  if (handleCORS(req, res)) return;

  // 2. Method check
  if (requirePOST(req, res)) return;

  // 3. API key authentication
  if (requireAPIKey(req, res)) return;

  // 4. Validate phone
  const phone = sanitizePhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  // 5. Validate OTP format (must be 6 digits)
  const otp = String(req.body?.otp || '').trim();
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'Please enter the 6-digit OTP.' });
  }

  // 6. Retrieve stored OTP from Redis
  let stored;
  try {
    stored = await getOTP(phone);
  } catch (err) {
    console.error('Redis getOTP failed:', err);
    return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
  }

  if (!stored) {
    return res.status(400).json({
      error: 'OTP has expired or was not found. Please request a new one.',
    });
  }

  // 7. Check wrong attempt count BEFORE verifying (prevents timing attacks leaking valid OTP)
  if (stored.attempts >= 3) {
    await deleteOTP(phone);
    return res.status(400).json({
      error: 'Too many incorrect attempts. Please request a new OTP.',
    });
  }

  // 8. Verify OTP
  if (stored.otp !== otp) {
    const attempts = await incrementOTPAttempts(phone);
    const remaining = 3 - attempts;
    if (remaining <= 0) {
      await deleteOTP(phone);
      return res.status(400).json({
        error: 'Too many incorrect attempts. Please request a new OTP.',
      });
    }
    return res.status(400).json({
      error: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    });
  }

  // 9. OTP correct — delete it immediately (single-use)
  await deleteOTP(phone);

  // 10. Find or create Shopify customer
  let customer;
  try {
    customer = await findCustomerByPhone(phone);

    if (customer) {
      // CRITICAL SAFETY CHECK: never overwrite real email-registered accounts
      if (!isPhoneLoginCustomer(customer)) {
        return res.status(409).json({
          error: 'existing_email_account',
          message:
            'This phone number is linked to an account with an email address. Please log in using your email, or contact us at support@ikkasa.com to link your phone number.',
        });
      }
      // Phone-login customer found — proceed to login
    } else {
      // New customer — use distributed lock to prevent race condition
      const locked = await acquireLock(phone);
      if (!locked) {
        // Another request is already creating this customer — wait briefly and retry find
        await new Promise((r) => setTimeout(r, 1500));
        customer = await findCustomerByPhone(phone);
        if (!customer) {
          return res.status(503).json({ error: 'Please try again in a moment.' });
        }
      } else {
        try {
          customer = await createPhoneCustomer(phone);
        } finally {
          await releaseLock(phone);
        }
      }
    }
  } catch (err) {
    console.error('Shopify customer operation failed:', err);
    return res.status(502).json({
      error: 'Failed to access your account. Please try again.',
    });
  }

  // 11. Generate a 32-byte random temporary password
  const tempPassword = randomBytes(32).toString('base64url');

  // 12. Set temp password on customer (only phone-login customers reach this point)
  try {
    await setCustomerTempPassword(customer.id, tempPassword);
  } catch (err) {
    console.error('Failed to set temp password:', err);
    return res.status(502).json({ error: 'Failed to prepare login. Please try again.' });
  }

  // 13. Return credentials for frontend auto-login
  // Both are transmitted over HTTPS only; temp password is useless without knowing the email
  return res.status(200).json({
    success: true,
    email: customer.email,
    tempPassword,
  });
}
