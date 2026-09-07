# Task 002: Tenant Management, /myadmin Routing & Dual Branding

- **Status**: Completed
- **Date**: 2026-09-07
- **Owner**: AI Engineer / kami

## Objectives
- [x] Replace free-text slug input with dynamic client dropdown in Admin staff credential creation modal.
- [x] Enforce single staff credential per organization slug in PostgreSQL (`<slug>_login.logins`) and control plane.
- [x] Fix staff password updates and credential validation across local backend and VPS Gateway.
- [x] Implement slug normalization (`houstun` -> `houston`) and tenant auto-discovery to prevent authentication lockouts.
- [x] Deprecate legacy `/admin` and `/kami` routes with `HTTP 404 Not Found`.
- [x] Consolidate administrative access exclusively under `/myadmin` and `/myadmin/`.
- [x] Clean sidebar bottom left corner of all obsolete diagnostic text (`VPS Gateway DB`, `Hostinger App`, `v2.0.0`), leaving only clean `Connected` / `Disconnected` status.
- [x] Remove placeholder attributes from the client database connection form in `static/index.html`.
- [x] Integrate `Cubifai Logo Design-03.png` (`/logo-client.png`) into client practice dashboard and client sign-in portal.
- [x] Integrate `Cubifai Logo Design-04.png` (`/logo.png`) into system admin CRM and admin sign-in portal.
- [x] Standardize production deployment configuration to Option A (`PORT`, `GATEWAY_API_URL`, `SESSION_SECRET`, `NODE_ENV`).
- [x] Establish dedicated PostgreSQL read-only role `client_viewer` (`9876@ClientViewer`) on Hetzner VPS.
- [x] Create comprehensive production `README.md` and document multi-tenant request interaction model.
- [x] Enforce Git repository hygiene by excluding `*.zip`, `Deploy.zip`, `*.txt`, `env.txt` via `.gitignore`.
- [x] Generate local `Deploy.zip` and `env.txt` for direct deployment on Hostinger.

