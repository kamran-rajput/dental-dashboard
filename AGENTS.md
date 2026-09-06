# AGENTS.md

## Project Purpose
A lightweight Node.js Express CRM backend and dashboard for dental practice management. It provides tenant authentication, appointment booking management, administrative controls, and multi-tenant PostgreSQL data isolation (Control Plane vs. Client Plane), alongside integrations with an external gateway API.

## Current Technology Stack
- **Runtime**: Node.js (`>= 18.0.0`)
- **Backend Framework**: Express.js (v4)
- **Authentication & Security**: JSON Web Tokens (`jsonwebtoken`), `cookie-parser`, `cors`, in-memory IP rate limiting
- **Database**: PostgreSQL (`pg`) with multi-tenant connection pooling and schema separation (`gateway` vs. `<client>_booking` / `<client>_login`)
- **Configuration**: `dotenv`
- **Frontend**: Vanilla JavaScript, HTML5, CSS (served statically from `static/`)
- **External Services**: CubifAI Gateway API (`gateway.cubifai.com`)

## How to Run the Project
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Environment Configuration**:
   Ensure `.env` exists in the project root with the necessary configuration (see `.env.example`):
   - `PORT`: Server port (defaults to `8000`)
   - `GATEWAY_API_URL`: External gateway URL (defaults to `https://gateway.cubifai.com`)
   - `SESSION_SECRET`: JWT signing secret
   - Database credentials (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`)
3. **Run Server**:
   - **Production**: `npm start` (runs `node server.js`)
   - **Development**: `npm run dev` (runs `node --watch server.js`)

## How to Test
No automated test suites or test runner scripts are currently configured in `package.json`.

## Important Development & Security Rules
- **No Hardcoded Credentials**: Never hardcode admin or fallback passwords in source code. Admin authentication is database-driven and strictly verified against the PostgreSQL table `gateway.admin_users`.
- **Rate Limiting**: Protect all public authentication routes (`/api/admin/login`, `/api/user/login`, `/api/auth/link`) with IP-based rate limiting.
- **Secure Cookies**: Enforce dynamic HTTPS `secure` cookies, `HttpOnly`, and `SameSite=Lax` for all session tokens (`user_session`, `admin_session`).
- **Input Sanitization**: Validate all client slugs against `/^[a-z0-9_-]{2,32}$/` to prevent SQL or DDL injection during schema provisioning.
- **Tenant Isolation**: Preserve the architectural boundary between the Control Plane (organizations registry/credentials in `gateway`) and Client Plane schemas (`<client>_booking` and `<client>_login`).
- **Static Assets**: Keep frontend UI logic, templates, and styles organized within the `static/` directory.

## Important Constraints
- **Engine Compatibility**: Requires Node.js version `>= 18.0.0` (utilizes native fetch and modern Node features).
- **Database Dependencies**: Multi-tenant database connections require reachable PostgreSQL hosts configured per organization.

## Purpose of the `.agent/` Directory
The `.agent/` directory is reserved for AI engineering context and repository metadata. It organizes:
- `tasks/`: Task definitions, backlogs, and status tracking (e.g. [`TASK-001`](file:///home/kami/Documents/Docker/dental-dashboard/.agent/tasks/TASK-001-security-hardening-and-admin-auth.md)).
- `architecture/`: System design diagrams, data models, and blueprints (e.g. [`system-architecture.md`](file:///home/kami/Documents/Docker/dental-dashboard/.agent/architecture/system-architecture.md)).
- `decisions/`: Architecture Decision Records (e.g. [`ADR-001`](file:///home/kami/Documents/Docker/dental-dashboard/.agent/decisions/ADR-001-database-driven-admin-auth.md)).
- `skills/`: Custom agent procedures and domain-specific cheatsheets.
- `workflows/`: Reusable multi-step operational and development workflows.
- `context/`: Additional project context, domain rules, and reference notes.
