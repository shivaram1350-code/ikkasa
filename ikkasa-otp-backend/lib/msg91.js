// lib/msg91.js
// Sends OTP via MSG91 SMS — no WhatsApp Business or Facebook needed.

/**
 * Sends a 6-digit OTP via SMS using MSG91.
 *
 * Setup in MSG91 dashboard:
 * 1. Go to OTP → Templates → Add Template
 * 2. Template name: ikkasa_otp
 * 3. Message: Your Ikkasa login code is ##OTP##. Valid for 10 minutes. Do not share.
 * 4. Copy the Template ID → set as MSG91_TEMPLATE_ID in Vercel env vars
 * 5. Copy your Auth Key → set as MSG91_AUTH_KEY in Vercel env vars
 *
 * @param {string} phone - 10-digit Indian mobile number (no country code)
 * @param {string} otp   - 6-digit OTP string
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendWhatsAppOtp(phone, otp) {
  const authKey    = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    console.error('MSG91 env vars missing: MSG91_AUTH_KEY or MSG91_TEMPLATE_ID');
    return { success: false, error: 'OTP service is not configured. Please contact support.' };
  }

  try {
    const res = await fetch('https://api.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile: `91${phone}`,
        otp: otp,
        otp_length: 6,
        otp_expiry: 10,
      }),
    });

    const data = await res.json();

    if (data.type === 'success' || res.ok) {
      return { success: true };
    }

    console.error('MSG91 SMS error:', JSON.stringify(data));
    return { success: false, error: 'Failed to send OTP. Please try again.' };

  } catch (err) {
    console.error('MSG91 fetch error:', err.message);
    return { success: false, error: 'OTP delivery failed. Please try again.' };
  }
}
