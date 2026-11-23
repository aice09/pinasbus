# PINASBUS operations runbook

For whoever deploys and runs PINASBUS on Kubernetes. The namespace, Helm release and database keep their original name, `bikolbus`.

## Pieces

| Piece | Where |
|---|---|
| App | Deployment `bikolbus` (2 replicas), image `ghcr.io/aice09/pinasbus:sha-<short>` built by GitHub Actions on every push to `main` |
| Database | CloudNativePG Cluster `bikolbus-db` (kept on `helm uninstall`); the app reads `uri` from Secret `bikolbus-db-app`. Schema migrations run automatically at startup (`lib/db.ts`, append-only list, advisory-locked) |
| Public URL | Emissary `Mapping` per hostname, served by the cluster's wildcard `Host`. Never add a `Host` for a name the wildcard covers |
| Payments | Secret `bikolbus-paymongo` (`PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`) |
| Demo accounts | Secret `bikolbus-demo` (generated once); see [test-accounts.md](test-accounts.md). `demo.accounts=false` stops seeding them |
| Hostnames | `host` (pinasbus.phlopentech.org) plus `extraHosts` (bikolbus.phlopentech.org keeps old links and the PayMongo webhook working) |
| Metrics | `/api/metrics` behind a bearer token (Secret `bikolbus-metrics`, generated once); `ServiceMonitor bikolbus`; Grafana dashboard ConfigMap `bikolbus-grafana-dashboard` in namespace `prometheus` (folder PINASBUS) |

## Health check

| Check | Command | Expected |
|---|---|---|
| Pods | `kubectl -n bikolbus get pods` | 2 × `bikolbus-…` and `bikolbus-db-1` Running |
| App + DB | `curl -s https://pinasbus.phlopentech.org/api/health` | `{"status":"ok"}` |
| Payments on | open any trip's seat page | a **Pay** button, not "Online payment isn't switched on" |
| Scrape | Prometheus → Status → Targets → `serviceMonitor/bikolbus/bikolbus` | UP |
| Webhook | Emissary access log: `grep paymongo/webhook` | `200` (a `401` means the webhook secret is wrong, see below) |

## Deploy or upgrade

```bash
# after CI is green for the commit
SHA=sha-$(git rev-parse --short=7 HEAD)
helm upgrade --install bikolbus charts/pinasbus -n bikolbus --create-namespace \
  --set image.tag=$SHA --set platformAdminEmails=you@example.com \
  --set 'extraHosts[0]=bikolbus.phlopentech.org' --wait
```

Keep `platformAdminEmails` (and any other private value) out of git: pass it with `--set` or an override file you don't commit. Rollback: `helm rollback bikolbus <revision> -n bikolbus` (migrations are additive, so older images still run).

## PayMongo keys and webhook

```bash
# webhook secret: PayMongo shows it only in the API response for the webhook
curl -s https://api.paymongo.com/v1/webhooks -u "$SK:" | jq '.data[] | {id, url: .attributes.url, secret: .attributes.secret_key}'
printf 'PAYMONGO_SECRET_KEY=%s\nPAYMONGO_WEBHOOK_SECRET=%s\n' "$SK" "$WHSK" \
  | kubectl -n bikolbus create secret generic bikolbus-paymongo --from-env-file=/dev/stdin --dry-run=client -o yaml | kubectl apply -f -
kubectl -n bikolbus rollout restart deploy/bikolbus
```

The webhook must point at `https://<host>/api/paymongo/webhook` with the event `checkout_session.payment.paid`. Bookings still confirm without it (the ticket page asks PayMongo directly), but customers who close the tab before the redirect stay "waiting for payment" until they reopen the ticket.

Going live: create a live webhook, swap in `sk_live_…` and its `whsk_…`, and set the PayMongo business display name.

## Metrics

| Metric | Type | Meaning |
|---|---|---|
| `bikolbus_bookings{status}` | gauge (from DB) | bookings per status |
| `bikolbus_seats_sold` | gauge (from DB, monotonic) | seats on paid bookings |
| `bikolbus_revenue_centavos{kind}` | gauge (from DB, monotonic) | `fare`, `convenience_fee`, `padala` collected |
| `bikolbus_route_seats_sold{trip}` | gauge (from DB) | seats sold per trip id |
| `bikolbus_shipments{status}` | gauge (from DB) | Padala per status |
| `bikolbus_users{role}`, `bikolbus_passenger_profiles`, `bikolbus_active_sessions` | gauge (from DB) | accounts |
| `bikolbus_paymongo_requests_total{op,status}` | counter (per pod) | metering of PayMongo API calls |
| `bikolbus_process_*`, `bikolbus_nodejs_*` | per pod | Node.js runtime |

DB-derived gauges are identical on every pod: aggregate with `max`, not `sum`. Per-hour sales: `max(delta(bikolbus_seats_sold[1h]))`.

## Backups

No CNPG `ScheduledBackup` is configured yet. Until it is:

```bash
kubectl -n bikolbus exec bikolbus-db-1 -c postgres -- pg_dump -U postgres -Fc bikolbus > bikolbus-$(date +%F).dump
# restore into an empty database:
kubectl -n bikolbus exec -i bikolbus-db-1 -c postgres -- pg_restore -U postgres -d bikolbus --clean < bikolbus-YYYY-MM-DD.dump
```

## Reset demo data

Platform → Companies → **Reset demo data** (type RESET). It deletes the demo companies, their trips and bookings, and the demo accounts, then seeds them again. Real companies are untouched.

## Reset a customer's password

Confirm the person owns the email first. Then:

```bash
NEW='a-temporary-password-they-must-change'
HASH=$(kubectl -n bikolbus exec deploy/bikolbus -- node -e '
  const c=require("crypto");const s=c.randomBytes(16);
  console.log("scrypt$"+s.toString("base64")+"$"+c.scryptSync(process.argv[1],s,64).toString("base64"))' "$NEW")
kubectl -n bikolbus exec bikolbus-db-1 -c postgres -- psql -U postgres -d bikolbus -v h="$HASH" -v e="customer@example.com" \
  -c "update users set password_hash = :'h' where lower(email) = lower(:'e'); delete from sessions where user_id in (select id from users where lower(email) = lower(:'e'));"
```

## Tests

```bash
npm test                     # pricing, layouts, booking window, webhook signature, route network, Padala fee
kubectl -n bikolbus port-forward svc/bikolbus-db-rw 15432:5432 &
DATABASE_URL=postgres://bikolbus:<pw>@127.0.0.1:15432/bikolbus npm run test:db   # holds, double booking, late payments
```

## Known limits

| Limit | Upgrade when |
|---|---|
| Rate limits are per pod memory | more than 2 replicas: move to Postgres or Redis |
| Trip list cached 15 s per pod | instant edits needed: add LISTEN/NOTIFY |
| A seat is taken for the whole trip, not per segment | operators sell partial legs |
| One fare per trip, whatever the drop-off | fares per drop-off are required |
| No email sending (receipts come from PayMongo; password resets are manual) | an SMTP relay is available |
