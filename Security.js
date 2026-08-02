/**
 * ============================================================
 * Circle Office Haryana Dashboard V3
 * Security.gs
 * Security utilities: input validation, sanitization, rate limiting.
 * ============================================================
 */

const PASSWORD_MIN_LENGTH = 8;
const LOGIN_RATE_LIMIT_KEY = 'login_attempts_';
const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function validateEmail(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { valid: false, error: 'Email is required.' };
  if (email.length > 254) return { valid: false, error: 'Email is too long.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { valid: false, error: 'Invalid email format.' };
  return { valid: true, value: email };
}

function validatePassword(password) {
  password = String(password || '');
  if (!password) return { valid: false, error: 'Password is required.' };
  if (password.length < PASSWORD_MIN_LENGTH) return { valid: false, error: 'Password must be at least ' + PASSWORD_MIN_LENGTH + ' characters.' };
  return { valid: true, value: password };
}

function sanitizeHtml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function checkLoginRateLimit_(email) {
  const cache = CacheService.getScriptCache();
  const key = LOGIN_RATE_LIMIT_KEY + email;
  const data = cache.get(key);
  if (data) {
    const attempts = JSON.parse(data);
    const now = Date.now();
    const recent = attempts.filter(function (t) { return now - t < LOGIN_RATE_LIMIT_WINDOW_MS; });
    if (recent.length >= LOGIN_RATE_LIMIT_MAX) {
      const wait = Math.ceil((LOGIN_RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 60000);
      return { allowed: false, waitMinutes: wait };
    }
  }
  return { allowed: true };
}

function recordLoginAttempt_(email) {
  const cache = CacheService.getScriptCache();
  const key = LOGIN_RATE_LIMIT_KEY + email;
  const data = cache.get(key);
  let attempts = data ? JSON.parse(data) : [];
  const now = Date.now();
  attempts.push(now);
  attempts = attempts.filter(function (t) { return now - t < LOGIN_RATE_LIMIT_WINDOW_MS; });
  cache.put(key, JSON.stringify(attempts), LOGIN_RATE_LIMIT_WINDOW_MS / 1000);
}

function clearLoginRateLimit_(email) {
  CacheService.getScriptCache().remove(LOGIN_RATE_LIMIT_KEY + email);
}
