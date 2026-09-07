/**
 * Control Plane & Client Plane Database Manager
 * Handles multi-tenant organization connections, credential validation,
 * and data access layer for plain client tables (bookings, stats, etc.)
 */

const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

// In-memory / file backup registry for Control Plane organizations
const controlPlaneRegistry = new Map();

// Client connection pools cache
const clientPools = new Map();

function getClientPool(orgConfig) {
  const key = orgConfig.client_slug;
  if (clientPools.has(key)) {
    return clientPools.get(key);
  }

  const pool = new Pool({
    host: orgConfig.db_host,
    port: orgConfig.db_port,
    database: orgConfig.db_name,
    user: orgConfig.db_user,
    password: orgConfig.db_pass,
    ssl: false,
    connectionTimeoutMillis: 3000
  });

  clientPools.set(key, pool);
  return pool;
}

// Control Plane Operations
async function getClientOrganization(slug) {
  const cleanSlug = slug.trim().toLowerCase();
  return controlPlaneRegistry.get(cleanSlug) || null;
}

async function listClientOrganizations() {
  return Array.from(controlPlaneRegistry.values());
}

async function registerClientOrganization(clientData) {
  const { client_slug, client_name, db_host, db_port, db_name, db_user, db_pass } = clientData || {};
  const cleanSlug = (client_slug || '').trim().toLowerCase();
  if (!cleanSlug) throw new Error('client_slug is required');
  
  const orgRecord = {
    client_slug: cleanSlug,
    client_name: (client_name || cleanSlug).trim(),
    db_host: (db_host || process.env.DB_HOST || 'n8n.cubifai.com').trim(),
    db_port: parseInt(db_port || process.env.DB_PORT || '5434', 10),
    db_name: (db_name || `db_${cleanSlug}`).trim(),
    db_user: (db_user || `user_${cleanSlug}`).trim(),
    db_pass: (db_pass || 'pass123').trim(),
    created_at: new Date().toISOString()
  };

  controlPlaneRegistry.set(cleanSlug, orgRecord);
  return orgRecord;
}

// In-memory staff credentials registry
const staffLoginsRegistry = new Map();

async function listStaffLogins() {
  return Array.from(staffLoginsRegistry.values()).map(s => ({
    client_slug: s.client_slug,
    username: s.username,
    password: s.password,
    created_at: s.created_at
  }));
}

async function registerStaffLogin(client_slug, username, password) {
  const cleanSlug = (client_slug || '').trim().toLowerCase();
  const cleanUser = (username || '').trim();
  if (!cleanSlug || !cleanUser) throw new Error('client_slug and username are required');
  const pwd = password || 'password123';

  // Enforce strictly one staff user per organization slug
  for (const [key, val] of staffLoginsRegistry.entries()) {
    if (val.client_slug === cleanSlug) {
      staffLoginsRegistry.delete(key);
    }
  }

  const key = `${cleanSlug}:${cleanUser}`;
  const record = {
    client_slug: cleanSlug,
    username: cleanUser,
    password: pwd,
    password_hash: hashPassword(pwd),
    created_at: new Date().toISOString()
  };
  staffLoginsRegistry.set(key, record);
  return record;
}

async function deleteStaffLogin(client_slug, username) {
  const cleanSlug = (client_slug || '').trim().toLowerCase();
  const cleanUser = (username || '').trim();
  const key = `${cleanSlug}:${cleanUser}`;
  return staffLoginsRegistry.delete(key);
}

async function validateStaffCredentials(client_slug, username, password) {
  const cleanSlug = (client_slug || '').trim().toLowerCase();
  const cleanUser = (username || '').trim();
  const key = `${cleanSlug}:${cleanUser}`;

  const staff = staffLoginsRegistry.get(key);
  if (!staff) {
    return { valid: false, reason: 'Invalid organization slug, staff username, or password.' };
  }

  const inputHash = hashPassword(password || '');
  if (inputHash !== staff.password_hash) {
    return { valid: false, reason: 'Invalid organization slug, staff username, or password.' };
  }

  return { valid: true, staff };
}

async function deleteClientOrganization(slug) {
  const cleanSlug = (slug || '').trim().toLowerCase();
  if (!cleanSlug) return false;
  if (clientPools.has(cleanSlug)) {
    const pool = clientPools.get(cleanSlug);
    pool.end().catch(() => {});
    clientPools.delete(cleanSlug);
  }
  // Remove associated staff logins as well
  for (const [key, val] of staffLoginsRegistry.entries()) {
    if (val.client_slug === cleanSlug) {
      staffLoginsRegistry.delete(key);
    }
  }
  return controlPlaneRegistry.delete(cleanSlug);
}

module.exports = {
  hashPassword,
  getClientOrganization,
  listClientOrganizations,
  registerClientOrganization,
  deleteClientOrganization,
  listStaffLogins,
  registerStaffLogin,
  deleteStaffLogin,
  validateStaffCredentials,
  getClientPool
};
