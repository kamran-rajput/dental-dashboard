# ADR 002: Exclusive /myadmin Routing, Single Staff Credential Rule & Dual Branding

## Status
Accepted

## Context
1. **Admin Path Ambiguity**:
   Previous iterations exposed multiple overlapping admin access paths (`/admin`, `/kami`, `/login?mode=admin`), creating confusion and potential reconnaissance exposure.
2. **Staff Credential Proliferation**:
   Dental practice tenants previously allowed adding multiple staff records under arbitrary free-text slugs, resulting in phantom entries and orphaned credentials.
3. **Spelling Sensitivity in Client Authentication**:
   Typographical differences in organization slugs (e.g. `houstun` vs. `houston`) led to authentication failures and subsequent rate limiter lockouts.
4. **Branding Differentiation**:
   The admin CRM and client practice dashboard required distinct, high-fidelity logos rather than generic icon placeholders.

## Decisions

1. **Exclusive `/myadmin` Routing**:
   - `/admin` and `/kami` (and all subpaths) are strictly disabled and return `HTTP 404 Not Found`.
   - Admin access is consolidated exclusively to `/myadmin` and `/myadmin/`.
   - Direct requests to `/myadmin` without an active session render the Admin Sign In form; upon verification, the Admin CRM loads in place.

2. **Strict Single Staff Credential Rule**:
   - Each client organization slug is enforced to have strictly ONE active staff credential in both PostgreSQL (`<slug>_login.logins`) and the control plane registry.
   - Creating or updating staff credentials automatically clears any previous login for that organization slug.

3. **Resilient Slug Aliasing & Tenant Auto-Discovery**:
   - Common typographical variations (e.g., `houstun` -> `houston`) are automatically normalized in both the VPS Gateway API and the Express backend.
   - If a slug is omitted, the gateway auto-discovers which client schema matches the provided username and password.

4. **Dual Branding Strategy**:
   - **Client Practice Dashboard**: Utilizes `Cubifai Logo Design-03.png` (`/logo-client.png`) for sidebar header and browser favicon.
   - **System Admin CRM**: Utilizes `Cubifai Logo Design-04.png` (`/logo.png`) for admin top bar and browser favicon.

## Consequences
- **Positive**: Hardened route obscurity for administrative controls; eliminated phantom or orphaned tenant staff records; resilient login experience preventing accidental 429 lockouts; tailored visual branding for distinct user tiers.
- **Negative**: Existing bookmarks targeting `/admin` or `/kami` will receive a 404 error and must navigate to `/myadmin`.
