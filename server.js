const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();
const dbManager = require('./db/db_manager');

const app = express();

const PORT = process.env.PORT || 8000;
const GATEWAY_API_URL = (process.env.GATEWAY_API_URL || 'https://gateway.cubifai.com').replace(/\/+$/, '');
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-hostinger-session-key-2026';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Helper: Fetch call to VPS Gateway API
async function callGateway(endpoint, method = 'GET', body = null, headers = {}) {
  const url = `${GATEWAY_API_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.detail || `Gateway error (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

// User Session Verification Helper
function getUserSession(req) {
  const token = req.cookies.user_session;
  if (!token) return null;
  try {
    return jwt.verify(token, SESSION_SECRET);
  } catch (err) {
    return null;
  }
}

// Admin Session Verification Helper
function getAdminSession(req) {
  const token = req.cookies.admin_session;
  if (!token) return null;
  try {
    return jwt.verify(token, SESSION_SECRET);
  } catch (err) {
    return null;
  }
}

// Rate Limiter for Authentication Endpoints (Protects against brute force)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_AUTH_ATTEMPTS = 5;

function authRateLimiter(req, res, next) {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
  const maxAttempts = isLocal ? 50 : MAX_AUTH_ATTEMPTS;
  const key = `${req.path}:${clientIp}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { attempts: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.attempts = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  if (entry.attempts >= maxAttempts) {
    const retryAfterMinutes = Math.max(1, Math.ceil((entry.resetAt - now) / 60000));
    return res.status(429).json({
      detail: `Too many failed authentication attempts. Please try again in ${retryAfterMinutes} minute(s).`
    });
  }

  // Track failed attempts on response finish
  res.on('finish', () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      entry.attempts += 1;
      rateLimitMap.set(key, entry);
    } else if (res.statusCode >= 200 && res.statusCode < 300) {
      rateLimitMap.delete(key);
    }
  });

  next();
}

// Clean up expired rate limit entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 30 * 60 * 1000).unref();

// Input Validation Helpers
const SLUG_REGEX = /^[a-z0-9_-]{2,32}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.@-]{2,64}$/;

function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_REGEX.test(slug.trim().toLowerCase());
}

function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_REGEX.test(username.trim());
}

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
}

function saveUserSession(req, res, sessionData) {
  const cleanPayload = { ...sessionData };
  delete cleanPayload.iat;
  delete cleanPayload.exp;
  delete cleanPayload.nbf;

  const token = jwt.sign(cleanPayload, SESSION_SECRET, { expiresIn: '7d' });
  res.cookie('user_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function saveAdminSession(req, res, adminData) {
  const cleanPayload = { ...adminData };
  delete cleanPayload.iat;
  delete cleanPayload.exp;
  delete cleanPayload.nbf;

  const token = jwt.sign(cleanPayload, SESSION_SECRET, { expiresIn: '12h' });
  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: 12 * 60 * 60 * 1000
  });
}

// Middleware: Require Connected Database Session
function requireUserAuth(req, res, next) {
  const session = getUserSession(req);
  if (!session || !session.access_token) {
    return res.status(401).json({ detail: 'Database connection required. Please connect your organization database in Settings.' });
  }
  req.userSession = session;
  next();
}

// Middleware: Require Admin Auth
function requireAdminAuth(req, res, next) {
  const session = getAdminSession(req);
  if (!session || !session.admin_token) {
    return res.status(401).json({ detail: 'Admin authentication required.' });
  }
  req.adminSession = session;
  next();
}

// -------------------------------------------------------------
// USER AUTHENTICATION & IDENTITY ENDPOINTS
// -------------------------------------------------------------

// GET /api/public/clients - Public directory list for client dropdowns
app.get('/api/public/clients', async (req, res) => {
  try {
    const clients = await callGateway('/api/public/clients', 'GET');
    return res.json(clients);
  } catch (err) {
    try {
      const orgs = await dbManager.listClientOrganizations();
      return res.json(orgs.map(o => ({ client_slug: o.client_slug, client_name: o.client_name })));
    } catch (e) {
      return res.json([{ client_slug: 'houston', client_name: 'Houston Dental Practice' }]);
    }
  }
});

// Hostinger / Practice Staff Login (Direct Gateway Authentication)
app.post('/api/user/login', authRateLimiter, async (req, res) => {
  const { email, username, password, client_slug } = req.body || {};
  const userIdent = (username || email || '').trim();
  if (!userIdent || !password) {
    return res.status(400).json({ detail: 'Username/Email and password are required' });
  }

  const cleanUser = userIdent.toLowerCase();
  const userId = `dash_user_${cleanUser.replace(/[^a-z0-9]/g, '_')}`;
  let cleanSlug = (client_slug || '').trim().toLowerCase();
  if (cleanSlug === 'houstun') cleanSlug = 'houston';

  // Attempt direct gateway authentication & linking first
  try {
    const gatewayRes = await callGateway('/api/auth/link', 'POST', {
      hostinger_user_id: userId,
      client_slug: cleanSlug || undefined,
      username: userIdent,
      password: password
    });

    const sessionData = {
      user_id: userId,
      email: cleanUser.includes('@') ? cleanUser : `${cleanUser}@practice.local`,
      client_slug: gatewayRes.client.slug,
      client_name: gatewayRes.client.name,
      access_token: gatewayRes.access_token,
      refresh_token: gatewayRes.refresh_token
    };

    saveUserSession(req, res, sessionData);

    return res.json({
      success: true,
      user: {
        id: userId,
        email: sessionData.email,
        linked: true,
        client_slug: sessionData.client_slug,
        client_name: sessionData.client_name
      }
    });
  } catch (gwErr) {
    console.warn('Gateway staff login attempt result:', gwErr.message);

    // If client credentials failed specifically against gateway, return 401
    if (gwErr.status === 401) {
      return res.status(401).json({ detail: 'Invalid staff username, password, or organization.' });
    }

    // Fallback: Legacy Hostinger user session if gateway is unreachable
    const existing = getUserSession(req) || {};
    const sessionData = {
      user_id: userId,
      email: cleanUser.includes('@') ? cleanUser : `${cleanUser}@practice.local`,
      client_slug: existing.client_slug || null,
      client_name: existing.client_name || null,
      access_token: existing.access_token || null,
      refresh_token: existing.refresh_token || null
    };

    saveUserSession(req, res, sessionData);

    return res.json({
      success: true,
      user: {
        id: userId,
        email: sessionData.email,
        linked: !!sessionData.client_slug,
        client_slug: sessionData.client_slug,
        client_name: sessionData.client_name
      }
    });
  }
});

app.post('/api/user/logout', (req, res) => {
  res.clearCookie('user_session');
  return res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/user/session', (req, res) => {
  const session = getUserSession(req);
  if (!session || !session.access_token || !session.client_slug) {
    return res.json({ authenticated: false, connected: false });
  }
  return res.json({
    authenticated: true,
    connected: true,
    user: {
      id: session.user_id,
      linked: true,
      client_slug: session.client_slug,
      client_name: session.client_name
    }
  });
});

// -------------------------------------------------------------
// GATEWAY ACCOUNT LINKING ENDPOINTS (Direct Backend Auth)
// -------------------------------------------------------------

// POST /api/auth/link - Connect client dashboard to VPS backend schema
app.post('/api/auth/link', authRateLimiter, async (req, res) => {
  const { client_slug, username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ detail: 'Staff username and password are required' });
  }

  let cleanSlug = (client_slug || '').trim().toLowerCase();
  if (cleanSlug === 'houstun') cleanSlug = 'houston';
  if (cleanSlug && !isValidSlug(cleanSlug)) {
    return res.status(400).json({ detail: 'Invalid organization slug format. Use 2-32 lowercase letters, numbers, hyphens, or underscores.' });
  }

  try {
    const existingSession = getUserSession(req) || {};
    const userId = existingSession.user_id || `dash_user_${username.trim().toLowerCase()}`;

    const gatewayRes = await callGateway('/api/auth/link', 'POST', {
      hostinger_user_id: userId,
      client_slug: cleanSlug || undefined,
      username: username.trim(),
      password: password
    });

    // Save backend tokens securely in HttpOnly session cookie
    const sessionData = {
      user_id: userId,
      client_slug: gatewayRes.client.slug,
      client_name: gatewayRes.client.name,
      access_token: gatewayRes.access_token,
      refresh_token: gatewayRes.refresh_token
    };

    saveUserSession(req, res, sessionData);

    return res.json({
      success: true,
      connected: true,
      client: gatewayRes.client
    });
  } catch (err) {
    console.warn('Gateway link failed, attempting local Control Plane check:', err.message);

    const lookupSlug = cleanSlug || 'houston';
    const org = await dbManager.getClientOrganization(lookupSlug);
    if (!org) {
      return res.status(401).json({ detail: 'Invalid organization slug, staff username, or password.' });
    }

    const authResult = await dbManager.validateStaffCredentials(lookupSlug, username, password);
    if (!authResult.valid) {
      return res.status(401).json({ detail: 'Invalid organization slug, staff username, or password.' });
    }

    const sessionData = {
      user_id: `dash_user_${username.trim().toLowerCase()}`,
      client_slug: org.client_slug,
      client_name: org.client_name,
      access_token: 'local_access_token',
      refresh_token: 'local_refresh_token'
    };

    saveUserSession(req, res, sessionData);

    return res.json({
      success: true,
      connected: true,
      client: {
        slug: org.client_slug,
        name: org.client_name
      }
    });
  }
});

// POST /api/auth/unlink - Disconnect client dashboard from VPS backend
app.post('/api/auth/unlink', async (req, res) => {
  const session = getUserSession(req);
  if (session && session.client_slug) {
    try {
      await callGateway('/api/auth/unlink', 'POST', {
        hostinger_user_id: session.user_id,
        client_slug: session.client_slug
      });
    } catch (err) {
      console.warn('Gateway unlink warning:', err.message);
    }
  }

  res.clearCookie('user_session');
  return res.json({ success: true, message: 'Database disconnected successfully' });
});

// -------------------------------------------------------------
// DATA PROXY ENDPOINTS (Client Dashboard)
// -------------------------------------------------------------

// Helper to execute gateway call with automatic token refresh
async function fetchGatewayData(req, res, path) {
  let session = req.userSession;
  if (!session.access_token) {
    return { error: true, status: 400, detail: 'Database connection required. Please connect in Settings.' };
  }

  try {
    const data = await callGateway(path, 'GET', null, {
      Authorization: `Bearer ${session.access_token}`
    });
    return { error: false, data };
  } catch (err) {
    // If 401, try to refresh token
    if (err.status === 401 && session.refresh_token) {
      try {
        console.log('Access token expired. Refreshing token via Gateway...');
        const refreshRes = await callGateway('/api/auth/refresh', 'POST', {
          refresh_token: session.refresh_token
        });

        session.access_token = refreshRes.access_token;
        session.refresh_token = refreshRes.refresh_token;
        saveUserSession(req, res, session);

        // Retry data call with new access token
        const retryData = await callGateway(path, 'GET', null, {
          Authorization: `Bearer ${session.access_token}`
        });
        return { error: false, data: retryData };
      } catch (refreshErr) {
        console.error('Token refresh failed:', refreshErr.message);
        return { error: true, status: 401, detail: 'Database session expired. Please reconnect in Settings.' };
      }
    }
    return { error: true, status: err.status || 500, detail: err.message };
  }
}

app.get('/api/bookings', requireUserAuth, async (req, res) => {
  const q = req.query.q ? `&q=${encodeURIComponent(req.query.q)}` : '';
  const status = req.query.status ? `&status=${encodeURIComponent(req.query.status)}` : '';
  const limit = req.query.limit ? `&limit=${encodeURIComponent(req.query.limit)}` : '';
  const path = `/api/data/bookings?_t=${Date.now()}${q}${status}${limit}`;

  const result = await fetchGatewayData(req, res, path);
  if (result.error) {
    return res.status(result.status).json({ detail: result.detail });
  }
  return res.json(result.data);
});

app.get('/api/stats', requireUserAuth, async (req, res) => {
  const period = req.query.period ? encodeURIComponent(req.query.period) : 'all';
  const path = `/api/data/stats?period=${period}&_t=${Date.now()}`;

  const result = await fetchGatewayData(req, res, path);
  if (result.error) {
    return res.status(result.status).json({ detail: result.detail });
  }
  return res.json(result.data);
});

// -------------------------------------------------------------
// ADMIN CRM ENDPOINTS
// -------------------------------------------------------------

app.post('/api/admin/login', authRateLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ detail: 'Username and password required' });
  }

  const cleanUser = String(username).trim();
  const rawPass = String(password);

  // 100% of admin authentications strictly query the Gateway API / PostgreSQL (gateway.admin_users)
  try {
    const adminRes = await callGateway('/api/admin/login', 'POST', { username: cleanUser, password: rawPass });
    const adminData = {
      admin_token: adminRes.token,
      username: adminRes.username,
      role: adminRes.role || 'admin'
    };

    saveAdminSession(req, res, adminData);
    return res.json({ success: true, username: adminRes.username, role: adminRes.role || 'admin' });
  } catch (err) {
    return res.status(401).json({ detail: 'Invalid admin credentials' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  return res.json({ success: true, message: 'Admin logged out successfully' });
});

app.get('/api/admin/session', (req, res) => {
  const session = getAdminSession(req);
  if (!session || !session.admin_token) {
    return res.json({ authenticated: false });
  }
  return res.json({ authenticated: true, username: session.username, role: session.role });
});

app.get('/api/admin/clients', requireAdminAuth, async (req, res) => {
  try {
    const clients = await callGateway('/api/admin/clients', 'GET', null, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    return res.json(clients);
  } catch (err) {
    const localClients = await dbManager.listClientOrganizations();
    return res.json(localClients);
  }
});

app.post('/api/admin/clients', requireAdminAuth, async (req, res) => {
  const { client_slug, client_name } = req.body || {};
  if (!client_slug || !client_name) {
    return res.status(400).json({ detail: 'client_slug and client_name are required' });
  }

  const cleanSlug = client_slug.trim().toLowerCase();
  if (!isValidSlug(cleanSlug)) {
    return res.status(400).json({ detail: 'Invalid client_slug format. Must be 2-32 lowercase alphanumeric characters, hyphens, or underscores.' });
  }

  const cleanName = client_name.trim().slice(0, 128);
  const payload = {
    ...req.body,
    client_slug: cleanSlug,
    client_name: cleanName,
    login_schema: `${cleanSlug}_login`,
    booking_schema: `${cleanSlug}_booking`
  };

  const regRecord = await dbManager.registerClientOrganization(payload);

  try {
    const newClient = await callGateway('/api/admin/clients', 'POST', payload, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    return res.json(newClient);
  } catch (err) {
    return res.json(regRecord);
  }
});

app.delete('/api/admin/clients/:slug', requireAdminAuth, async (req, res) => {
  const { slug } = req.params;
  if (!slug) return res.status(400).json({ detail: 'slug is required' });

  const cleanSlug = slug.trim().toLowerCase();
  if (!isValidSlug(cleanSlug)) {
    return res.status(400).json({ detail: 'Invalid client slug' });
  }

  await dbManager.deleteClientOrganization(cleanSlug);

  try {
    await callGateway(`/api/admin/clients/${cleanSlug}`, 'DELETE', null, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
  } catch (err) {}

  return res.json({ success: true, message: `Client organization '${cleanSlug}' deleted successfully.` });
});

app.get('/api/admin/staff-logins', requireAdminAuth, async (req, res) => {
  try {
    const gatewayLogins = await callGateway('/api/admin/staff-logins', 'GET', null, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    return res.json(gatewayLogins);
  } catch (err) {
    const logins = await dbManager.listStaffLogins();
    return res.json(logins);
  }
});

app.post('/api/admin/client-login', requireAdminAuth, async (req, res) => {
  const { client_slug, username, password } = req.body || {};
  if (!client_slug || !username || !password) {
    return res.status(400).json({ detail: 'client_slug, username, and password are required' });
  }

  const cleanSlug = client_slug.trim().toLowerCase();
  if (!isValidSlug(cleanSlug)) {
    return res.status(400).json({ detail: 'Invalid client_slug format' });
  }

  const cleanUsername = username.trim();
  if (!isValidUsername(cleanUsername)) {
    return res.status(400).json({ detail: 'Invalid username format. Must be 2-64 alphanumeric characters, dots, underscores, or hyphens.' });
  }

  // Strict Validation: Organization MUST exist in the system before staff credentials can be created
  let clientExists = false;
  try {
    const clients = await callGateway('/api/admin/clients', 'GET', null, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    clientExists = Array.isArray(clients) && clients.some(c => (c.client_slug || c.slug) === cleanSlug);
  } catch (e) {
    const org = await dbManager.getClientOrganization(cleanSlug);
    clientExists = !!org;
  }

  if (!clientExists) {
    return res.status(404).json({ detail: `Client organization '${cleanSlug}' does not exist. Please register the client organization first.` });
  }

  const payload = { client_slug: cleanSlug, username: cleanUsername, password: String(password) };

  try {
    const gatewayRes = await callGateway('/api/admin/client-login', 'POST', payload, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    await dbManager.registerStaffLogin(cleanSlug, cleanUsername, password);
    return res.json({ success: true, message: 'Staff login registered in Control Plane.', record: gatewayRes.client_login || payload });
  } catch (err) {
    return res.status(err.status || 500).json({ detail: err.message || 'Failed to register staff login' });
  }
});

app.delete('/api/admin/staff-logins', requireAdminAuth, async (req, res) => {
  const { client_slug, username } = req.body || {};
  if (!client_slug || !username) {
    return res.status(400).json({ detail: 'client_slug and username are required' });
  }

  const cleanSlug = client_slug.trim().toLowerCase();
  const cleanUsername = username.trim();

  await dbManager.deleteStaffLogin(cleanSlug, cleanUsername);

  try {
    await callGateway('/api/admin/staff-logins', 'DELETE', { client_slug: cleanSlug, username: cleanUsername }, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
  } catch (err) {}

  return res.json({ success: true, message: `Staff credential '${cleanUsername}' for org '${cleanSlug}' deleted.` });
});

app.post('/api/admin/revoke', requireAdminAuth, async (req, res) => {
  try {
    const result = await callGateway('/api/admin/revoke', 'POST', req.body, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

// -------------------------------------------------------------
// SECURITY & DIRECTORY TRAVERSAL PROTECTION MIDDLEWARE
// -------------------------------------------------------------

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Prevent directory traversal attacks
  const rawPath = req.path || '';
  try {
    const decodedPath = decodeURIComponent(rawPath);
    const normalizedPath = path.normalize(decodedPath);
    if (normalizedPath.includes('..') || rawPath.includes('..') || rawPath.includes('%2e%2e')) {
      return res.status(403).send('Forbidden: Invalid path traversal attempt');
    }
  } catch (e) {
    return res.status(400).send('Bad Request: Invalid URL encoding');
  }
  next();
});

// -------------------------------------------------------------
// HTML PAGE ROUTES
// -------------------------------------------------------------

// Secret Admin Access URL Path (e.g. /kami)
app.get(['/kami', '/kami/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'login.html'));
});

app.get('/login', (req, res) => {
  if (req.query.mode === 'admin' || req.query.mode === 'kami') {
    return res.sendFile(path.join(__dirname, 'static', 'login.html'));
  }
  res.redirect('/');
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'admin.html'));
});

app.get(['/', '/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// Serve Static Assets with no-cache headers
app.use(express.static(path.join(__dirname, 'static'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hostinger CRM Web Server running on port ${PORT}`);
  console.log(`Relaying Gateway API calls to '${GATEWAY_API_URL}'`);
});
