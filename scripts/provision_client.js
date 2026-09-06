/**
 * Automated Client Database Provisioning Script
 * 
 * Usage:
 * node scripts/provision_client.js --slug=houston --name="Houstun Family Practice" --user=houstunUser --pass=9876@Houstun
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

// Helper to parse CLI arguments
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      args[key] = value;
    }
  });
  return args;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function provisionClient() {
  const args = parseArgs();

  const slug = (args.slug || 'houston').trim().toLowerCase();
  const name = args.name || 'Houstun Family Practice';
  const username = args.user || 'houstunUser';
  const password = args.pass || '9876@Houstun';
  const dbHost = args.dbhost || process.env.DB_HOST || 'n8n.cubifai.com';
  const dbPort = parseInt(args.dbport || process.env.DB_PORT || '5434', 10);
  const dbName = args.dbname || process.env.DB_NAME || 'client_databases';
  const dbUser = args.dbuser || process.env.DB_USER || 'houstunUser';
  const dbPass = args.dbpass || process.env.DB_PASSWORD || '9876@Houstun';

  console.log(`\n--- Starting Provisioning for Client Organization '${slug}' ---`);
  console.log(`Target Database: ${dbHost}:${dbPort}/${dbName}`);

  // 1. Connect to Client DB and execute Client DDL
  const clientPool = new Pool({
    host: dbHost,
    port: dbPort,
    database: dbName,
    user: dbUser,
    password: dbPass,
    ssl: false
  });

  try {
    const clientDdl = fs.readFileSync(path.join(__dirname, '..', 'db', 'client_plane_schema.sql'), 'utf8');
    await clientPool.query(clientDdl);
    console.log('✔ Client Plane tables initialized (staff_logins, bookings, patients, ai_calls, stats)');

    // 2. Insert or update staff credentials in staff_logins
    const pwdHash = hashPassword(password);
    await clientPool.query(`
      INSERT INTO staff_logins (username, password_hash, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (username) 
      DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `, [username, pwdHash]);
    console.log(`✔ Staff login created/updated: username '${username}'`);

    // 3. Seed initial sample stats if not present
    await clientPool.query(`
      INSERT INTO stats (period, total_calls, booked, cancelled, new_leads)
      VALUES ('all', 42, 28, 5, 9)
      ON CONFLICT (period) DO NOTHING;
    `);
    console.log('✔ Sample practice stats initialized');

  } catch (err) {
    console.error('✖ Error provisioning Client DB:', err.message);
  } finally {
    await clientPool.end();
  }

  // 4. Register in Control Plane DB if CONTROL_DB_URL or local pool is available
  const controlDbHost = process.env.CONTROL_DB_HOST || dbHost;
  const controlDbPort = parseInt(process.env.CONTROL_DB_PORT || String(dbPort), 10);
  const controlDbName = process.env.CONTROL_DB_NAME || dbName;
  const controlDbUser = process.env.CONTROL_DB_USER || dbUser;
  const controlDbPass = process.env.CONTROL_DB_PASS || dbPass;

  const controlPool = new Pool({
    host: controlDbHost,
    port: controlDbPort,
    database: controlDbName,
    user: controlDbUser,
    password: controlDbPass,
    ssl: false
  });

  try {
    const controlDdl = fs.readFileSync(path.join(__dirname, '..', 'db', 'control_plane_schema.sql'), 'utf8');
    await controlPool.query(controlDdl);
    console.log('✔ Control Plane tables verified/initialized');

    await controlPool.query(`
      INSERT INTO client_organizations (client_slug, client_name, db_host, db_port, db_name, db_user, db_pass)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (client_slug) DO UPDATE SET
        client_name = EXCLUDED.client_name,
        db_host = EXCLUDED.db_host,
        db_port = EXCLUDED.db_port,
        db_name = EXCLUDED.db_name,
        db_user = EXCLUDED.db_user,
        db_pass = EXCLUDED.db_pass;
    `, [slug, name, dbHost, dbPort, dbName, dbUser, dbPass]);
    console.log(`✔ Client organization '${slug}' registered in Control Plane DB`);

    // Ensure default master admin user exists in admin_users
    const adminHash = hashPassword('admin123');
    await controlPool.query(`
      INSERT INTO admin_users (username, password_hash, role)
      VALUES ('admin', $1, 'admin')
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash]);
    console.log('✔ Default Admin account ensured in Control Plane (username: admin)');

  } catch (err) {
    console.error('✖ Error updating Control Plane DB:', err.message);
  } finally {
    await controlPool.end();
  }

  console.log(`--- Provisioning Complete for '${slug}' ---\n`);
}

if (require.main === module) {
  provisionClient().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { provisionClient };
