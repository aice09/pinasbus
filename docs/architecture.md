# BikolBus architecture

For developers changing the code.

```
browser ── Cloudflare ── cloudflared ── Emissary (Mapping) ── bikolbus (Next.js 16, 2 pods) ── Postgres (CNPG)
                                                                   │  ▲
                                                                   ▼  │ webhook
                                                               PayMongo API
Prometheus ── ServiceMonitor ── /api/metrics (bearer)        Grafana ← ConfigMap in ns prometheus
```

## Code map

| Path | What |
|---|---|
| `lib/catalog.ts` | Bus classes, pricing (`price`: fare + 5.2% + ₱16 fee), Manila date helpers, `network()` (pick-up → reachable drop-offs), `connects()` |
| `lib/layouts.ts` | Seat layouts per class (sleepers: `L`/`U` berths on two decks) and `seatName` |
| `lib/db.ts` | Pool, append-only migrations under an advisory lock, first-run seed of trips from `data/trips.json` |
| `lib/routes.ts` | Trips from the DB, 15 s cache, `saveTrip` for admins |
| `lib/bookings.ts` | Seat holds (`seat_locks` primary key prevents double booking), expiry, `markPaid` (idempotent; late or wrong payments become `needs_refund`) |
| `lib/padala.ts` | Shipments, rates (in `settings`), fee formula, status timeline |
| `lib/auth.ts` | scrypt password hashes, server-side sessions (only a SHA-256 of the cookie token is stored), `requireUser`/`requireAdmin` |
| `lib/paymongo.ts` | Checkout Sessions, payment lookup, expiry, webhook signature check, metering counter |
| `lib/metrics.ts` | Prometheus registry; business gauges read from Postgres at scrape time |
| `app/actions/*` | Server actions: every one re-checks auth and validates input with zod |
| `app/api/bookings` | JSON booking endpoint (same-origin check, rate limit, PayMongo checkout) |
| `app/api/paymongo/webhook` | Verifies `Paymongo-Signature`, confirms bookings or shipments |
| `components/Bus3D.tsx` | three.js via react-three-fiber: seats, berths, CR, deck and front labels, lift-the-upper-deck |
| `components/SeatPlan.tsx` | Accessible 2D plan, the same data as the 3D view |
| `components/RouteSelects.tsx` | From/To dropdowns constrained by the route network |
| `charts/bikolbus` | Helm chart |

## Payment flow

1. `POST /api/bookings` validates the trip, pair, seats and passengers, inserts the booking and its `seat_locks` in one transaction (unique violation → 409 with the current taken seats), then creates a PayMongo Checkout Session with the booking reference and amount.
2. The browser goes to PayMongo. Success returns to `/booking/<ref>`.
3. Confirmation comes from whichever arrives first: the webhook (`checkout_session.payment.paid`) or the ticket page asking PayMongo for the session. Both call `markPaid`, which locks the row and is idempotent.
4. Holds older than 15 minutes are expired on the next booking attempt, and their checkout sessions are expired at PayMongo. A payment that still arrives re-locks the seats if free, else marks `needs_refund`.

Padala uses the same checkout and confirmation path, with `markShipmentPaid`.

## Security

- CSP with a per-request script nonce (`proxy.ts`), HSTS, `X-Frame-Options: DENY`, no `X-Powered-By`.
- Sessions: 32 random bytes in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; the DB holds only its SHA-256. Password change signs out all devices.
- Server actions carry Next's built-in origin check; the JSON booking API checks `Origin` itself.
- Login is rate-limited per IP and per email and gives the same answer whether or not the email exists.
- Every admin action calls `requireAdmin()`; every account query filters by the session's user id.
- Pods run as non-root with a read-only root filesystem and all capabilities dropped; NetworkPolicies allow ingress only from Emissary and Prometheus, and to the DB only from the app and the CNPG operator.
