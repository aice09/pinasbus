# Demo and test accounts

For anyone demonstrating or testing PINASBUS. **Development and demonstration only.**

All demo accounts share one generated password, stored in the Kubernetes Secret `bikolbus-demo` (key `password`), never in git:

```bash
kubectl -n bikolbus get secret bikolbus-demo -o jsonpath='{.data.password}' | base64 -d; echo
```

Every demo account must change that password at first sign-in. Before production, set `demo.accounts=false` and use **Platform → Companies → Reset demo data**, or delete the demo companies.

| Organization | Role | Email |
|---|---|---|
| PINASBUS | Platform Administrator (disabled unless `demo.platformAdmin=true`) | `platform.admin@demo.pinasbus.test` |
| Victory Liner | Company Administrator | `company.admin@victory-liner.demo.pinasbus.test` |
| Victory Liner | Operations Manager | `operations.manager@victory-liner.demo.pinasbus.test` |
| Victory Liner | Dispatcher | `dispatcher@victory-liner.demo.pinasbus.test` |
| Victory Liner | Ticketing Officer | `ticketing.officer@victory-liner.demo.pinasbus.test` |
| Victory Liner | Cashier | `cashier@victory-liner.demo.pinasbus.test` |
| Victory Liner | Driver | `driver@victory-liner.demo.pinasbus.test` |
| Victory Liner | Conductor | `conductor@victory-liner.demo.pinasbus.test` |
| Victory Liner | Baggage Handler | `baggage.handler@victory-liner.demo.pinasbus.test` |
| Victory Liner | Finance Officer | `finance.officer@victory-liner.demo.pinasbus.test` |
| Bicol Isarog | Company Administrator | `company.admin@bicol-isarog.demo.pinasbus.test` |
| Bicol Isarog | Operations Manager | `operations.manager@bicol-isarog.demo.pinasbus.test` |
| Bicol Isarog | Dispatcher | `dispatcher@bicol-isarog.demo.pinasbus.test` |
| Bicol Isarog | Driver | `driver@bicol-isarog.demo.pinasbus.test` |
| Bicol Isarog | Conductor | `conductor@bicol-isarog.demo.pinasbus.test` |
| Passenger | Regular passenger | `passenger.regular@demo.pinasbus.test` |
| Passenger | Senior citizen | `passenger.senior@demo.pinasbus.test` |
| Passenger | PWD | `passenger.pwd@demo.pinasbus.test` |

Card issuer and shipping operator accounts arrive with their portals (phases 4 and 5).

## Things to try

- **Isolation:** as the Bicol Isarog administrator, open `/ops/victory-liner`. You are refused.
- **Crew scope:** as the Victory Liner dispatcher, assign the demo driver to a trip. The driver then sees only that trip under **My trips**.
- **Priority seats:** as the regular passenger, seat 1 (♿) offers only the PWD type. The PWD passenger can book it with an ID type and last 4 characters.
- **Terminal sale:** as the cashier, open a manifest and sell a seat for cash; it appears in the manifest and the audit log.
- **Payment:** the PayMongo test card `4343 4343 4343 4345`, any future expiry, CVC `123`.

## Demo data and its sources

| Company | What is real | What is indicative |
|---|---|---|
| Bicol Isarog (Isarog Line), Peñafrancia Tours, Legaspi St. Jude, RSL Bus | Trip codes, departure times, bus classes and fares from bicolisarog.com, 2026-11-23 | Stop times after the first pick-up, road itineraries |
| Victory Liner | Terminal names and addresses, bus classes (Wikipedia, 2026-11-24) | Routes, times and fares: their fare page was unavailable |

Bus plate numbers (`DEMO 1001` and so on) and fleet details are placeholders. None of these companies is affiliated with PINASBUS.
