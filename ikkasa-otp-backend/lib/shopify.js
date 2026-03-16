/**
 * Shopify Admin API helpers.
 * All customer operations go through here.
 */

const SHOP   = process.env.SHOPIFY_STORE_DOMAIN; // e.g. ikkasa.myshopify.com
const TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN;
const API    = `https://${SHOP}/admin/api/2024-01`;

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': TOKEN,
});

/**
 * Find a customer by their Indian phone number (10 digits, no country code).
 * Searches both +91XXXXXXXXXX and 91XXXXXXXXXX formats.
 */
export async function findCustomerByPhone(phone) {
  const res = await fetch(
    `${API}/customers/search.json?query=phone%3A%2B91${phone}&limit=1`,
    { headers: headers() }
  );
  const data = await res.json();
  if (data.customers && data.customers.length > 0) return data.customers[0];

  // Fallback: search without + prefix
  const res2 = await fetch(
    `${API}/customers/search.json?query=phone%3A91${phone}&limit=1`,
    { headers: headers() }
  );
  const data2 = await res2.json();
  return data2.customers?.[0] || null;
}

/**
 * Determine if a customer was created by the OTP system.
 * Phone-login customers get a placeholder email in the format: otp_XXXXXXXXXX@ikkasa-accounts.com
 */
export function isPhoneLoginCustomer(customer) {
  return customer.email && customer.email.startsWith('otp_') && customer.email.endsWith('@ikkasa-accounts.com');
}

/**
 * Create a brand-new phone-login customer.
 * Uses a placeholder email so Shopify's required email field is satisfied.
 */
export async function createPhoneCustomer(phone) {
  const placeholderEmail = `otp_${phone}@ikkasa-accounts.com`;
  const res = await fetch(`${API}/customers.json`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      customer: {
        email: placeholderEmail,
        phone: `+91${phone}`,
        verified_email: false,
        accepts_marketing: false,
        tags: 'phone-login,whatsapp-otp',
        send_email_welcome: false,
        note: `Created via WhatsApp OTP login on ${new Date().toISOString()}`,
      },
    }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(`Failed to create customer: ${JSON.stringify(data.errors)}`);
  return data.customer;
}

/**
 * Set a temporary random password on a customer account.
 * ONLY called on phone-login customers — never on real email accounts.
 */
export async function setCustomerTempPassword(customerId, password) {
  const res = await fetch(`${API}/customers/${customerId}.json`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      customer: {
        id: customerId,
        password,
        password_confirmation: password,
      },
    }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(`Failed to set password: ${JSON.stringify(data.errors)}`);
  return data.customer;
}
