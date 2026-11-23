# PINASBUS roadmap

For the product owner and builders. Each phase ships, deploys and is tested before the next starts.

| Phase | Scope | Status |
|---|---|---|
| 1 | Rebrand; multi-company core; fixed roles with server-side checks; platform admin (companies, categories, users, audit, demo reset); company workspace (fleet, amenities, visual seat-layout editor, routes with segment fares and road and ferry itinerary, recurring schedules, dated trips, dispatch, manifests, check-in, terminal sales, bookings and refunds, settings, reports, audit); passenger categories, discounts and accessible seats with the release policy; multi-operator search; demo data with sources; demo accounts | **Done** (2026-11-24) |
| 2 | Baggage: registration at booking or check-in, multiple bags, per-bag and per-bus weight limits, extra charges, QR tags, handler scanning, status timeline, passenger tracking | Next |
| 3 | Maps and tracking: MapLibre and OpenStreetMap, station coordinates, route lines, a simulated GPS feed (clearly labelled), live position, speed, ETA, deviation and speeding alerts, phone-based GPS for crews, Server-Sent Events | Planned |
| 4 | Ferries: shipping-operator workspace (vessels, ports, sailings, manifests), bus and ferry links on routes, QR boarding by the conductor, multimodal trip status | Planned |
| 5 | Stored-value cards: card-issuer workspace, card programs and cards, loading through PayMongo, balances read from the issuer, reconciliation | Planned |
| 6 | Notifications: email (Mailpit in development, SMTP in production) and in-app; booking, payment, reminder, delay, cancellation and baggage events; self-service password reset; MFA for privileged roles | Planned |

Known limits carried forward:
- A seat is held for the whole trip, not per segment.
- Rate limits are per pod.
- The route network is cached for 30 seconds.
