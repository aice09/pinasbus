# PINASBUS

A multi-operator bus booking and operations platform for the Philippines. Many bus companies, each in its own isolated workspace, share one passenger-facing search with seat selection on a 3D bus and PayMongo payments.

**Docs:** [passenger guide](docs/passenger-guide.md) · [bus company guide](docs/operator-guide.md) · [platform admin guide](docs/platform-admin-guide.md) · [shipping operator guide](docs/shipping-operator-guide.md) · [card issuer guide](docs/card-issuer-guide.md) · [test accounts](docs/test-accounts.md) · [architecture](docs/architecture.md) · [decisions](docs/adr/) · [operations runbook](docs/operations.md) · [HTTP API](docs/api.md) · [compliance checklist](docs/compliance.md) · [roadmap](docs/roadmap.md)

> Demonstration: the bus companies in the demo data are real, listed from public sources, and **not affiliated** with PINASBUS. See [test-accounts.md](docs/test-accounts.md#demo-data-and-its-sources).

## Stack

Next.js 16 (App Router, server actions) and TypeScript, PostgreSQL (CloudNativePG), three.js through react-three-fiber, PayMongo Checkout, Prometheus metrics, and a Helm chart for Kubernetes with Emissary.

## Run locally

```bash
npm ci
DATABASE_URL=postgres://... PAYMONGO_SECRET_KEY=sk_test_... DEMO_PASSWORD=some-long-dev-password npm run dev
npm test          # unit tests
npm run test:db   # database tests (DATABASE_URL required; builds and removes a throwaway company)
```

Migrations and the demo seed run automatically on first use.

| Env | Purpose |
|---|---|
| `DATABASE_URL` | Postgres |
| `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` | payments (off without the key) |
| `PAYMONGO_METHODS` | default `card,gcash,paymaya` |
| `PUBLIC_BASE_URL` | PayMongo redirects |
| `PLATFORM_ADMIN_EMAILS` | emails that become platform administrators |
| `DEMO_PASSWORD`, `DEMO_PLATFORM_ADMIN` | demo accounts and whether the demo platform admin is enabled |
| `METRICS_TOKEN` | bearer token for `/api/metrics` |
| `APP_SECRET_KEY` | 32-byte base64 key that encrypts two-step sign-in seeds |
| `MFA_REQUIRED` | `false` only for local development |
| `SMTP_URL`, `MAIL_FROM` | outgoing email (Mailpit in the chart) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI assistant (hidden without the key) |
| `JOBS=off` | disable background jobs (tests) |

## Deploy

See [operations.md](docs/operations.md). CI publishes `ghcr.io/aice09/pinasbus:sha-<short>` on every push to `main`.
