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

