# ADR 0001: Grow the existing Next.js app into a modular monolith

**Status:** accepted, 2026-11-24.

**Context.** The PINASBUS specification recommends a Go backend, Keycloak, NATS and PostGIS. A working TypeScript/Next.js booking app already existed, with PayMongo payments, seat holds, a 3D seat picker, metrics and a deployment. The specification also asks to preserve working functionality and to start with a modular monolith.

**Decision.** Keep one TypeScript codebase. Separate domains by module (`lib/*` per domain, no imports from `app/` into `lib/`), keep pure business rules I/O-free, and keep all SQL in the owning module. Add services only when a domain needs independent scaling or a different runtime.

**Consequences.**
- One deployable, one test runner, shared types between browser and server (the price shown equals the price charged).
- Extracting a domain later means turning its `lib` module into a service behind the same functions.
- Go, NATS and Keycloak are not used yet; real-time GPS (phase 3) will revisit this for WebSocket fan-out.
