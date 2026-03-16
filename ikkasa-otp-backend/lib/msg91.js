/**
 * MSG91 WhatsApp OTP sender.
 * Uses the Flow API which supports WhatsApp templates.
 */

export async function sendWhatsAppOTP(phone, otp) {
  const payload = {
    template_id: process.env.MSG91_TEMPLATE_ID,
    short_url: '0',
    realTimeResponse: '1',
    recipients: [
      {
        mobiles: `91${phone}`,
        otp: otp,
        // MSG91 replaces ##OTP## or {{otp}} in your approved template
      },
    ],
  };

  const res = await fetch('https://api.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: process.env.MSG91_AUTH_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MSG91 HTTP error ${res.status}: ${text}`);
  }

  const result = await res.json();

  // MSG91 returns { type: 'success' } on success, { type: 'error', message: '...' } on failure
  if (result.type === 'error') {
    throw new Error(`MSG91 error: ${result.message || JSON.stringify(result)}`);
  }

  return result;
}
