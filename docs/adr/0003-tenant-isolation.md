# ADR 0003: Shared database with an organization column

**Status:** accepted, 2026-11-24.

**Context.** Bus companies must never see each other's operations or finances. Expected scale is tens of companies.

**Options.** A database per tenant, a schema per tenant, or shared tables with `org_id`.

**Decision.** Shared tables with `org_id`. Every company page and action resolves the company from its URL slug through `orgCtx` or `actionCtx`, checks the caller's membership and permission there, and filters every query by that company's id. References inside a request (bus, layout, route, crew) are re-checked to belong to the same company.

**Consequences.**
- Cross-company views (the platform overview, passenger search across operators) are plain queries.
- Isolation depends on code discipline. It is covered by end-to-end tests that try other companies' URLs and forged forms.
- Postgres row-level security can be added later as defence in depth without changing the model.
