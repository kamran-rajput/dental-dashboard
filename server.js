const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

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

function saveUserSession(res, sessionData) {
  const cleanPayload = { ...sessionData };
  delete cleanPayload.iat;
  delete cleanPayload.exp;
  delete cleanPayload.nbf;

  const token = jwt.sign(cleanPayload, SESSION_SECRET, { expiresIn: '7d' });
  res.cookie('user_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set true in strict HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function saveAdminSession(res, adminData) {
  const cleanPayload = { ...adminData };
  delete cleanPayload.iat;
  delete cleanPayload.exp;
  delete cleanPayload.nbf;

  const token = jwt.sign(cleanPayload, SESSION_SECRET, { expiresIn: '12h' });
  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 12 * 60 * 60 * 1000
  });
}

// Middleware: Require User Auth
function requireUserAuth(req, res, next) {
  const session = getUserSession(req);
  if (!session) {
    return res.status(401).json({ detail: 'Not authenticated. Please log in.' });
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
// USER AUTHENTICATION & IDENTITY ENDPOINTS (Hostinger side)
// -------------------------------------------------------------

// Hostinger User Login
app.post('/api/user/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ detail: 'Email and password are required' });
  }

  // Simulate Hostinger user database verification or demo user lookup
  const cleanEmail = email.trim().toLowerCase();
  const userId = `hostinger_user_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;

  // Preserve existing database connection links if session already existed
  const existing = getUserSession(req) || {};

  const sessionData = {
    user_id: userId,
    email: cleanEmail,
    client_slug: existing.client_slug || null,
    client_name: existing.client_name || null,
    access_token: existing.access_token || null,
    refresh_token: existing.refresh_token || null
  };

  saveUserSession(res, sessionData);

  return res.json({
    success: true,
    user: {
      id: userId,
      email: cleanEmail,
      linked: !!sessionData.client_slug,
      client_slug: sessionData.client_slug,
      client_name: sessionData.client_name
    }
  });
});

app.post('/api/user/logout', (req, res) => {
  res.clearCookie('user_session');
  return res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/user/session', (req, res) => {
  const session = getUserSession(req);
  if (!session) {
    return res.json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    user: {
      id: session.user_id,
      email: session.email,
      linked: !!(session.client_slug && session.access_token),
      client_slug: session.client_slug,
      client_name: session.client_name
    }
  });
});

// -------------------------------------------------------------
// GATEWAY ACCOUNT LINKING ENDPOINTS
// -------------------------------------------------------------

// POST /api/auth/link
app.post('/api/auth/link', requireUserAuth, async (req, res) => {
  const { client_slug, username, password } = req.body || {};
  if (!client_slug || !username || !password) {
    return res.status(400).json({ detail: 'Organization slug, username, and password are required' });
  }

  try {
    const gatewayRes = await callGateway('/api/auth/link', 'POST', {
      hostinger_user_id: req.userSession.user_id,
      client_slug: client_slug.trim().toLowerCase(),
      username: username.trim(),
      password: password
    });

    // Update user session cookie with access token & refresh token
    const updatedSession = {
      ...req.userSession,
      client_slug: gatewayRes.client.slug,
      client_name: gatewayRes.client.name,
      access_token: gatewayRes.access_token,
      refresh_token: gatewayRes.refresh_token
    };

    saveUserSession(res, updatedSession);

    return res.json({
      success: true,
      client: gatewayRes.client
    });
  } catch (err) {
    console.error('Link database error:', err.message);
    return res.status(err.status || 500).json({ detail: err.message || 'Failed to link database' });
  }
});

// POST /api/auth/unlink
app.post('/api/auth/unlink', requireUserAuth, async (req, res) => {
  const { client_slug } = req.userSession;
  if (!client_slug) {
    return res.status(400).json({ detail: 'No database connection to unlink' });
  }

  try {
    await callGateway('/api/auth/unlink', 'POST', {
      hostinger_user_id: req.userSession.user_id,
      client_slug: client_slug
    });
  } catch (err) {
    console.warn('Gateway unlink warning:', err.message);
  }

  const updatedSession = {
    ...req.userSession,
    client_slug: null,
    client_name: null,
    access_token: null,
    refresh_token: null
  };

  saveUserSession(res, updatedSession);

  return res.json({ success: true, message: 'Database unlinked successfully' });
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
        saveUserSession(res, session);

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

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ detail: 'Username and password required' });
  }

  try {
    const adminRes = await callGateway('/api/admin/login', 'POST', { username, password });
    const adminData = {
      admin_token: adminRes.token,
      username: adminRes.username,
      role: adminRes.role
    };

    saveAdminSession(res, adminData);
    return res.json({ success: true, username: adminRes.username, role: adminRes.role });
  } catch (err) {
    return res.status(401).json({ detail: err.message || 'Invalid admin credentials' });
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
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

app.post('/api/admin/clients', requireAdminAuth, async (req, res) => {
  try {
    const newClient = await callGateway('/api/admin/clients', 'POST', req.body, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    return res.json(newClient);
  } catch (err) {
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

app.post('/api/admin/client-login', requireAdminAuth, async (req, res) => {
  try {
    const result = await callGateway('/api/admin/client-login', 'POST', req.body, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

app.post('/api/admin/link-user', requireAdminAuth, async (req, res) => {
  try {
    const result = await callGateway('/api/admin/link-user', 'POST', req.body, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

app.get('/api/admin/links', requireAdminAuth, async (req, res) => {
  try {
    const links = await callGateway('/api/admin/links', 'GET', null, {
      Authorization: `Bearer ${req.adminSession.admin_token}`
    });
    return res.json(links);
  } catch (err) {
    return res.status(err.status || 500).json({ detail: err.message });
  }
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
// HTML PAGE ROUTES
// -------------------------------------------------------------

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'login.html'));
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
