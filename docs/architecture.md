# PINASBUS architecture

For developers changing the code. Decisions are recorded in [adr/](adr/).

```
browser ── Cloudflare ── cloudflared ── Emissary (Mappings: pinasbus., bikolbus.) ── PINASBUS app (Next.js, 2 pods) ── Postgres (CNPG)
                                                                                       │  ▲
                                                                                       ▼  │ signed webhook
                                                                                   PayMongo API
Prometheus ── ServiceMonitor ── /api/metrics (bearer)          Grafana ← ConfigMap in ns prometheus
```

A **modular monolith** ([ADR 0001](adr/0001-modular-monolith.md)): one deployable, with domains separated by module boundaries in `lib/`.

## Domains and where they live

| Domain | Module | Owns (tables) |
|---|---|---|
| Identity and access | `lib/auth.ts`, `lib/password.ts`, `lib/rbac.ts`, `lib/tenancy.ts` | users, sessions, memberships |
| Platform and operators | `app/actions/platform.ts`, `lib/tenancy.ts` | organizations, categories, audit_log |
| Passengers | `app/actions/account.ts` | passengers (saved profiles) |
| Fleet | `app/actions/ops.ts` (fleet), `lib/layouts.ts` | buses, amenities, seat_layouts |
| Routes and schedules | `app/actions/ops.ts` (routes, schedules) | stations, routes, schedules |
| Trips and seat inventory | `lib/trips.ts`, `lib/seatpolicy.ts` | trips, trip_seats, seat_releases |
| Booking and ticketing | `lib/bookings.ts`, `lib/pricing.ts`, `app/api/bookings` | bookings |
| Payments | `lib/paymongo.ts`, `app/api/paymongo/webhook` | (PayMongo is the record; bookings hold checkout and payment ids) |
| Padala | `lib/padala.ts` | shipments, shipment_events, settings |
| Reporting | `lib/metrics.ts`, dashboards | reads only |

Rules: domain modules (`lib/*`) never import from `app/`. Pure logic (pricing, seat policy, layouts, RBAC) has no I/O and is shared with the browser. Every SQL query is parameterized.

## Data model (core)

```
organizations 1─* memberships *─1 users 1─* passengers
organizations 1─* seat_layouts, buses, routes, schedules, trips, bookings, audit_log
routes 1─* schedules 1─* trips 1─* trip_seats *─1 bookings
seat_layouts 1─* buses, schedules, trips          stations (shared, referenced by route stops)
trips 1─* seat_releases                            categories (platform-wide) ─* routes, buses
```

- **Route stops** are an ordered JSON array: station, minutes from departure, cumulative fare, pick-up/drop-off flags. A segment fare is `fare[j] − fare[i]`, adjusted by the schedule's percent (`lib/pricing.ts`).
- **Schedules** recur (operating days, validity window). **Trips** are dated instances created on demand (`ensureTrips`, idempotent on `(schedule_id, service_date)`). A trip copies its layout and bus, so later layout edits don't move sold seats.
- **Seat inventory:** `trip_seats (trip_id, seat)` is the primary key that makes double booking impossible. A seat counts as taken while its booking is paid, or pending and inside the 15-minute hold.
- Migrations are an append-only list in `lib/db.ts`, run at startup under a Postgres advisory lock. Migration 3 turned the single-company model into this one and moved existing bookings onto trip instances.

## Multi-tenancy

Shared database, tenant column ([ADR 0003](adr/0003-tenant-isolation.md)). Each company-owned row has `org_id`.

- Every workspace page calls `orgCtx(slug, permission)`. It resolves the company, the caller's membership and role, and the permission, then redirects anyone without them.
- Every workspace action calls `actionCtx(slug, permission)` and filters every query by `c.org.id`. Foreign references such as a bus, layout, route or crew member are checked to belong to the same company before use.
- Suspended companies disappear from search and their workspaces lock (platform admins can still read).
- Platform administrators enter workspaces as **Auditor** (read-only).

## Authorization (RBAC)

14 fixed roles map to 17 permissions in `lib/rbac.ts`. The matrix is rendered on every company's **Staff and roles** page and unit-tested. Crew roles get `trips.view_assigned`: `canSeeTrip` limits them to trips where they are the driver or conductor, for pages and for check-in.

## Accessible seating policy

`lib/seatpolicy.ts` holds pure functions; the company's settings hold the parameters:

- `seatAllowed(kind, passengerCategory, released)`: PWD seats are for PWD passengers, senior seats for seniors, priority seats for either. Regular seats are open to all. Crew, reserved and unavailable seats are never sold.
- `releaseDue(policy, departsAt)`: from `releaseHoursBefore` before departure, unsold seats of `releaseKinds` are released. `availability()` writes each release once to `seat_releases` and to the audit log. Sold seats are never released.
- The same check runs in the browser (to offer only valid passenger types), in the booking API, and in terminal sales.

## Payment flow

1. `POST /api/bookings` validates the trip, the segment, each seat against the passenger type and releases, discount IDs, and saved passengers belonging to the caller. It then prices each seat (fare after discount, plus the online fee), inserts the booking and `trip_seats` in one transaction, and creates a PayMongo Checkout Session.
2. The webhook (`checkout_session.payment.paid`, HMAC-verified) or the ticket page's direct lookup calls `markPaid`. That function locks the row and is idempotent. Late payments re-lock the seats if they are free; otherwise the booking becomes `needs_refund` and releases its seats. Wrong amounts are flagged the same way.
3. Terminal sales skip PayMongo, are paid on creation, carry no online fee, and record the seller.

## Security

- Sessions: 32-byte random token in an `HttpOnly; Secure; SameSite=Lax` cookie; the database stores only its SHA-256. Passwords use scrypt.
- Forced password change for issued passwords. Login is rate-limited per IP and per email. Disabled accounts are refused.
- CSP with a per-request nonce, HSTS, frame denial. Server actions use Next's origin check; the JSON API checks `Origin` itself.
- Audit log of every administrative change, with actor and IP.
- Containers run non-root on a read-only root filesystem; NetworkPolicies limit ingress.

Not yet: MFA for privileged accounts, and email-based password resets (see [roadmap](roadmap.md)).

## Testing

| Suite | Command | Covers |
|---|---|---|
| Unit | `npm test` | Fees and segment fares, discounts, seat policy and release deadline, RBAC matrix and crew scope, layout validation, sales window, webhook signatures, Padala |
| Database | `npm run test:db` (needs `DATABASE_URL`) | Trip creation, legs and network; holds, double booking, late and wrong payments; priority seat release with audit (on a throwaway company) |
| End to end | Playwright scripts used during development | Every role's pages, tenant isolation, crew scope, seat-policy refusals in the UI and API, terminal sale, editors |
