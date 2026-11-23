# ADR 0002: Built-in accounts and sessions instead of Keycloak (for now)

**Status:** accepted, 2026-11-24. Revisit before production.

**Context.** The specification lists Keycloak with OIDC and MFA. Passengers need frictionless sign-up; staff need company-scoped roles that change often. The cluster runs Keycloak for other products.

**Decision.** Keep the app's own email and password accounts (scrypt hashes, server-side sessions) and model roles as memberships in the app's database. RBAC stays in `lib/rbac.ts` regardless of who authenticates.

**Consequences.**
- No MFA yet; privileged accounts depend on passwords plus rate limiting.
- Moving to Keycloak later replaces `startSession` and `currentUser` with an OIDC callback. Memberships and roles stay in PINASBUS, because they are business data, not identity.
- Before production, add either TOTP MFA for privileged roles or Keycloak for staff sign-in.
