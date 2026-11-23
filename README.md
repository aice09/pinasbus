# BikolBus

Bus seat booking for Manila–Bicol routes: search trips, pick seats on a 3D bus (or an accessible seat plan), pay with PayMongo Checkout (GCash, Maya, card).

- **App:** Next.js 16 (App Router), PostgreSQL (`pg`), three.js through `@react-three/fiber`.
- **Data:** routes, bus classes and fares are in `data/trips.json`, scraped from the operator's public trip search (`scripts/parse.py`, `scripts/catalog.py`). The convenience fee is the operator's 5.2% + PHP 16 per seat.
- **Seats:** a seat is held for 15 minutes in `seat_locks` (its primary key prevents double booking). It is confirmed by the PayMongo webhook, or by polling the checkout session when the ticket page loads.

## Run locally

```bash
npm ci
DATABASE_URL=postgres://... PAYMONGO_SECRET_KEY=sk_test_... npm run dev
npm test   # pricing, seat layouts, booking window, webhook signature
```

| Env | Purpose |
|---|---|
| `DATABASE_URL` | Postgres; the schema is created on first use |
| `PAYMONGO_SECRET_KEY` | `sk_test_…` / `sk_live_…`; without it, online payment is off |
| `PAYMONGO_WEBHOOK_SECRET` | `whsk_…` of the webhook for `checkout_session.payment.paid` → `https://<host>/api/paymongo/webhook` |
| `PAYMONGO_METHODS` | default `card,gcash,paymaya` |
| `PUBLIC_BASE_URL` | used for PayMongo success/cancel redirects |

## Deploy (Kubernetes)

CI pushes `ghcr.io/aice09/bikolbus:sha-<short>` on every push to `main`.

```bash
kubectl create namespace bikolbus
kubectl -n bikolbus create secret generic bikolbus-paymongo \
  --from-literal=PAYMONGO_SECRET_KEY=sk_test_... --from-literal=PAYMONGO_WEBHOOK_SECRET=whsk_...
helm upgrade --install bikolbus charts/bikolbus -n bikolbus --set image.tag=sha-<short>
```

The chart creates the Deployment, Service, PDB, ingress-only NetworkPolicies, a CloudNativePG `Cluster` (kept on uninstall) and an Emissary `Mapping` for `host`. It does not create an Emissary `Host`: the wildcard Host serves it.
