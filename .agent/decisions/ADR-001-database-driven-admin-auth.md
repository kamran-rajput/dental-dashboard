# ADR 001: Database-Driven Admin Authentication & Rate Limiting

## Status
Accepted

## Context
Previously, `server.js` contained a local fallback check against `process.env.ADMIN_USERNAME || 'admin'` and `process.env.ADMIN_PASSWORD || 'admin123'`. When deployed in environments where these variables were not explicitly provided, the fallback allowed anyone to gain full administrator privileges using default credentials. In addition, authentication endpoints lacked brute-force throttling, and cookies were flagged with `secure: false`.

## Decisions
1. **Single Source of Truth for Admin Credentials**:
   - Eliminated the local fallback credentials entirely.
   - All admin logins (`POST /api/admin/login`) must authenticate through the Gateway API against the PostgreSQL table `gateway.admin_users`.
2. **Brute-Force Rate Limiting**:
   - Implemented an IP-keyed in-memory rate limiter on `/api/admin/login`, `/api/user/login`, and `/api/auth/link`.
   - Rejects traffic with HTTP 429 Too Many Requests after 5 failed attempts within a 15-minute window.
3. **Dynamic Secure Cookie Setting**:
   - Session cookies (`user_session`, `admin_session`) dynamically set the `Secure` attribute based on `req.secure`, `X-Forwarded-Proto: https`, or `NODE_ENV === 'production'`.
4. **Strict Schema & Slug Sanitization**:
   - Client slugs are strictly restricted to `/^[a-z0-9_-]{2,32}$/` to prevent SQL/DDL injection vulnerabilities during dynamic PostgreSQL schema creation (`<client>_login`, `<client>_booking`).

## Consequences
- **Positive**: Complete elimination of the default admin backdoor; enhanced protection against automated credential stuffing; strict tenant isolation.
- **Maintenance**: Admin password rotations must be executed against the `gateway.admin_users` table in PostgreSQL.
