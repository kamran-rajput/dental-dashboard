# System Architecture & Multi-Tenant Design

## Architecture Overview

The Dental CRM Dashboard follows a multi-tier, multi-tenant architecture designed to strictly isolate clinic data while providing centralized administrative control.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Browser Client UI                             │
│  - Client Portal: / & /login (static/index.html with logo-client.png)  │
│  - System Admin: /myadmin (static/admin.html with logo.png)            │
│  - Legacy /admin & /kami disabled (404 Not Found)                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Hostinger Node.js Web Server (server.js)                 │
│  - JWT Cookie Session Management (user_session, admin_session)         │
│  - In-Memory Auth Rate Limiting (5 failed / 15m; 50 for localhost)     │
│  - Tenant Auto-Discovery & Slug Aliasing (e.g. houstun -> houston)     │
│  - Direct Staff Login via /api/user/login                              │
│  - Gateway API Proxying (https://gateway.cubifai.com)                  │
│  - Public Clients Directory Endpoint (/api/public/clients)             │
│  - Static Asset Delivery (static/)                                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               VPS Caddy Reverse Proxy (proxy-caddy-1)                  │
│  - Handles SSL termination for *.cubifai.com                           │
│  - Routes gateway.cubifai.com ──► gateway-api:8000                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              VPS Gateway API Service (gateway-api:8000)                │
│  - Direct SQL Queries via pg.Pool                                      │
│  - Centralized Authentication & Token Rotation                         │
│  - Dynamic Tenant Provisioning & Schema Management                     │
│  - Enforces Single Staff Credential per Tenant Slug                    │
│  - Full Cascade Schema Drop on Tenant Deletion                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          VPS PostgreSQL Database Container (client-postgres)           │
│          Database: client_databases                                    │
│                                                                        │
│   ├── gateway (Control Plane)                                          │
│   │   ├── admin_users (Central Admin Auth, e.g. kami / 9876@Kami)      │
│   │   ├── client_directory (Tenant Registry)                           │
│   │   ├── account_links (External User Mappings)                       │
│   │   └── refresh_tokens (Active Session Tokens)                       │
│   │                                                                    │
│   └── <client_slug>_booking & <client_slug>_login                      │
│       ├── <client_slug>_login.logins (Single provisioned credential)  │
│       └── <client_slug>_booking.bookings (Clinic appointments & logs)  │
└────────────────────────────────────────────────────────────────────────┘
```

## Isolation Model
1. **Control Plane (`gateway` schema)**:
   - Stores zero patient health records or operational bookings.
   - Contains tenant registries, encrypted/hashed credentials, and session state.
2. **Client Plane (`<client>_booking` and `<client>_login` schemas)**:
   - Dedicated PostgreSQL schemas per dental clinic.
   - Strictly ONE staff user per organization slug in `<slug>_login.logins`.
   - Ensures strict data separation so tenant records can never collide or leak across practices.

## Branding Architecture
- **Client Practice Dashboard**:
  - Favicon & Header: `static/logo-client.png` (Derived from `Cubifai Logo Design-03.png`).
  - Minimalist sidebar footer status indicator (`Connected` vs. `Disconnected`).
- **System Admin CRM**:
  - Favicon & Top Bar: `static/logo.png` (Derived from `Cubifai Logo Design-04.png`).

## Deployment & Production Environment (Option A)
- **Hostinger Node.js Web Layer**:
  - Requires strictly 4 environment variables:
    ```env
    PORT=8000
    GATEWAY_API_URL=https://gateway.cubifai.com
    SESSION_SECRET=super-secret-hostinger-session-key-2026
    NODE_ENV=production
    ```
  - Zero direct database exposure on Hostinger. All database operations, tenant authentication, bookings queries, and tenant provisioning route securely through `GATEWAY_API_URL`.

- **Multi-Tenant Request Flow (Client A vs. Client B)**:
  - Client A (`houston`) logs in &rarr; Gateway validates credentials against `houston_login.logins` &rarr; issues JWT bound to `houston` &rarr; Hostinger stores encrypted `user_session` cookie &rarr; subsequent queries route to `houston_booking.bookings`.
  - Client B (`dallas`) logs in &rarr; Gateway validates against `dallas_login.logins` &rarr; issues JWT bound to `dallas` &rarr; queries route to `dallas_booking.bookings`.
  - Strict PostgreSQL schema separation prevents cross-tenant data access.

- **PostgreSQL Database Roles**:
  - `gateway_user`: Backend engine role on Hetzner VPS with DDL permissions for schema provisioning and cascading drops.
  - `client_viewer`: Dedicated read-only role (`9876@ClientViewer`) for queries and provisioning audits (`SELECT` permissions only).

- **Repository Hygiene**:
  - Deployment archives (`Deploy.zip`) and environment text dumps (`env.txt`) are excluded from Git tracking via `.gitignore`.


