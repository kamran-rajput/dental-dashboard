# System Architecture & Multi-Tenant Design

## Architecture Overview

The Dental CRM Dashboard follows a multi-tier, multi-tenant architecture designed to strictly isolate clinic data while providing centralized administrative control.

```
┌────────────────────────────────────────────────────────┐
│                   Browser Client UI                    │
│          (static/index.html, static/admin.html)        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│        Hostinger Node.js Web Server (server.js)        │
│  - JWT Cookie Session Management (user/admin)         │
│  - In-Memory Auth Rate Limiting (5 attempts/15 mins)   │
│  - Gateway API Proxying (https://gateway.cubifai.com)  │
│  - Static Asset Delivery                               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│        VPS Caddy Reverse Proxy (proxy-caddy-1)         │
│  - Handles SSL termination for *.cubifai.com           │
│  - Routes gateway.cubifai.com ──► gateway-api:8000     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│       VPS Gateway API Service (gateway-api:8000)       │
│  - Direct SQL Queries via pg.Pool                      │
│  - Centralized Authentication & Token Rotation         │
│  - Dynamic Tenant Provisioning & Schema Management     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│   VPS PostgreSQL Database Container (client-postgres)  │
│   Database: client_databases                           │
│                                                        │
│   ├── gateway (Control Plane)                          │
│   │   ├── admin_users (Central Admin Auth)             │
│   │   ├── client_directory (Tenant Registry)           │
│   │   ├── account_links (External User Mappings)       │
│   │   └── refresh_tokens (Active Session Tokens)       │
│   │                                                    │
│   └── <client_slug>_booking & <client_slug>_login      │
│       ├── <client_slug>_login.logins                   │
│       └── <client_slug>_booking.bookings               │
└────────────────────────────────────────────────────────┘
```

## Isolation Model
1. **Control Plane (`gateway` schema)**:
   - Stores zero patient health records or operational bookings.
   - Contains tenant registries, encrypted/hashed credentials, and session state.
2. **Client Plane (`<client>_booking` and `<client>_login` schemas)**:
   - Dedicated PostgreSQL schemas per dental clinic.
   - Ensures strict data separation so tenant records can never collide or leak across practices.
