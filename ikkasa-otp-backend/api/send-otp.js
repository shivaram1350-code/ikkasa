import { handleCORS, requirePOST, requireAPIKey, sanitizePhone } from '../lib/middleware.js';
import { checkRateLimit, setOTP } from '../lib/redis.js';
import { sendWhatsAppOTP } from '../lib/msg91.js';
import { randomInt } from 'crypto';

export default async function handler(req, res) {
  // 1. CORS + preflight
  if (handleCORS(req, res)) return;

  // 2. Method check
  if (requirePOST(req, res)) return;

  // 3. API key authentication
  if (requireAPIKey(req, res)) return;

  // 4. Validate and sanitize phone number
  const phone = sanitizePhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({
      error: 'Please enter a valid 10-digit Indian mobile number (starting with 6–9).',
    });
  }

  // 5. Server-side rate limiting (3 OTPs per phone per 10 minutes)
  let rateCheck;
  try {
    rateCheck = await checkRateLimit(phone);
  } catch (err) {
    console.error('Rate limit check failed:', err);
    return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
  }

  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'Too many OTP requests. Please wait 10 minutes before trying again.',
    });
  }

  // 6. Generate cryptographically random 6-digit OTP
  const otp = String(randomInt(100000, 999999));

  // 7. Store OTP in Redis with 10-minute TTL
  try {
    await setOTP(phone, otp);
  } catch (err) {
    console.error('Failed to store OTP in Redis:', err);
    return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
  }

  // 8. Send via MSG91 WhatsApp
  try {
    await sendWhatsAppOTP(phone, otp);
  } catch (err) {
    console.error('MSG91 send failed:', err);
    // Don't expose internal error details to client
    return res.status(502).json({
      error: 'Failed to send WhatsApp message. Please check your number and try again.',
    });
  }

  // 9. Success — never reveal the OTP in the response
  return res.status(200).json({
    success: true,
    message: `OTP sent to +91 ${phone} on WhatsApp.`,
  });
}
