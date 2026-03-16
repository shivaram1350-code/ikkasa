/**
 * Upstash Redis client via REST API.
 * Works on Vercel serverless — no persistent TCP connections needed.
 */

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Upstash Redis env vars not set');
  const res = await fetch(`${REDIS_URL}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(`Redis error: ${data.error}`);
  return data.result;
}

// OTP Store
export async function setOTP(phone, otp) {
  const val = JSON.stringify({ otp, attempts: 0, createdAt: Date.now() });
  await redisCmd('SET', `otp:${phone}`, val, 'EX', '600');
}

export async function getOTP(phone) {
  const raw = await redisCmd('GET', `otp:${phone}`);
  return raw ? JSON.parse(raw) : null;
}

export async function incrementOTPAttempts(phone) {
  const data = await getOTP(phone);
  if (!data) return 0;
  data.attempts += 1;
  const ttl = await redisCmd('TTL', `otp:${phone}`);
  await redisCmd('SET', `otp:${phone}`, JSON.stringify(data), 'EX', String(ttl > 0 ? ttl : 600));
  return data.attempts;
}

export async function deleteOTP(phone) {
  await redisCmd('DEL', `otp:${phone}`);
}

// Rate limiter: 3 sends per phone per 10 minutes
export async function checkRateLimit(phone) {
  const key = `rate:${phone}`;
  const count = await redisCmd('INCR', key);
  if (count === 1) await redisCmd('EXPIRE', key, '600');
  return { allowed: count <= 3, count };
}

// Distributed lock: prevent duplicate customer creation
export async function acquireLock(phone) {
  const result = await redisCmd('SET', `lock:create:${phone}`, '1', 'NX', 'EX', '30');
  return result === 'OK';
}

export async function releaseLock(phone) {
  await redisCmd('DEL', `lock:create:${phone}`);
}
