# AGENTS.md

## Project Purpose
A lightweight Node.js Express CRM backend and dashboard for dental practice management. It provides tenant authentication, appointment booking management, administrative controls, and multi-tenant PostgreSQL data isolation (Control Plane vs. Client Plane), alongside integrations with an external gateway API (`https://gateway.cubifai.com`).

## Current Technology Stack
- **Runtime**: Node.js (`>= 18.0.0`)
- **Backend Framework**: Express.js (v4)
- **Authentication & Security**: JSON Web Tokens (`jsonwebtoken`), `cookie-parser`, `cors`, in-memory IP rate limiting with localhost relaxed thresholds
- **Database**: PostgreSQL (`pg`) with multi-tenant schema separation (`gateway` vs. `<client>_booking` / `<client>_login`)
- **Configuration**: `dotenv`
- **Frontend**: Vanilla JavaScript, HTML5, CSS / Tailwind CSS CDN (served statically from `static/`)
- **External Services**: CubifAI Gateway API (`https://gateway.cubifai.com`)

## URL Structure & Page Routes
- **Client Portal**:
  - Dashboard: `/` or `/dashboard` (Served from `static/index.html`)
  - Sign-in: `/login` (Served from `static/login.html`)
- **System Admin Portal**:
  - Admin Panel & Sign-in: `/myadmin` or `/myadmin/` (Served from `static/admin.html` when authenticated, or `static/login.html` when unauthenticated)
  - Legacy routes (`/admin`, `/kami`) are strictly disabled and return `HTTP 404 Not Found`.

## How to Run the Project Locally
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Environment Configuration**:
   Create a `.env` file in the project root:
   ```env
   PORT=8000
   GATEWAY_API_URL=https://gateway.cubifai.com
   SESSION_SECRET=your-secure-random-jwt-secret-here
   NODE_ENV=development
   ```
3. **Run Server**:
   - **Production**: `npm start` (runs `node server.js`)
   - **Development**: `npm run dev` (runs `node --watch server.js`)

## Important Development & Security Rules
- **Exclusive Admin Route**: Admin access is strictly routed through `/myadmin`. Never expose or re-enable `/admin` or `/kami`. Direct visits to unauthenticated `/myadmin` display the admin login; once verified, the admin CRM loads.
- **No Hardcoded Credentials**: Never hardcode admin or fallback passwords in source code. Admin authentication is database-driven and strictly verified against the PostgreSQL table `gateway.admin_users`.
- **Single Staff Credential per Tenant**: Each dental practice organization slug enforces strictly ONE active staff credential in both PostgreSQL (`<slug>_login.logins`) and the control plane.
- **Slug Normalization & Aliasing**: The gateway and backend normalize common typographical variations (such as `houstun` -> `houston`) and support tenant auto-discovery by credentials when slug is omitted.
- **Rate Limiting**: Protect all public authentication routes (`/api/admin/login`, `/api/user/login`, `/api/auth/link`) with IP-based rate limiting. Localhost IP is allotted higher attempts in development to prevent lockouts.
- **Secure Cookies**: Enforce dynamic HTTPS `secure` cookies, `HttpOnly`, and `SameSite=Lax` for all session tokens (`user_session`, `admin_session`).
- **Input Sanitization**: Validate all client slugs against `/^[a-z0-9_-]{2,32}$/` to prevent SQL or DDL injection during schema provisioning.
- **Branding Assets**:
  - Client Dashboard: `static/logo-client.png` (Derived from `Cubifai Logo Design-03.png`)
  - Admin CRM: `static/logo.png` (Derived from `Cubifai Logo Design-04.png`)
- **Tenant Isolation**: Preserve the architectural boundary between the Control Plane (`gateway` schema) and Client Plane schemas (`<client>_booking` and `<client>_login`).

## Purpose of the `.agent/` Directory
The `.agent/` directory organizes AI engineering context and repository metadata:
- `tasks/`: Task definitions, backlogs, and status tracking ([`TASK-001`](file:///home/kami/Documents/Docker/dental-dashboard/.agent/tasks/TASK-001-security-hardening-and-admin-auth.md), [`TASK-002`](file:///home/kami/Documents/Docker/dental-dashboard/.agent/tasks/TASK-002-tenant-management-routing-and-branding.md)).
- `architecture/`: System design diagrams, data models, and blueprints ([`system-architecture.md`](file:///home/kami/Documents/Docker/dental-dashboard/.agent/architecture/system-architecture.md)).
- `decisions/`: Architecture Decision Records ([`ADR-001`](file:///home/kami/Documents/Docker/dental-dashboard/.agent/decisions/ADR-001-database-driven-admin-auth.md), [`ADR-002`](file:///home/kami/Documents/Docker/dental-dashboard/.agent/decisions/ADR-002-exclusive-myadmin-routing-and-tenant-provisioning.md)).
- `context/`: Additional project context, domain rules, and reference notes.
