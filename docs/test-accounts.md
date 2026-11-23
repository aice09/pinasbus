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
| Partas | Company Administrator | `company.admin@partas.demo.pinasbus.test` |
| EDSA Carousel | Company Administrator | `company.admin@edsa-carousel.demo.pinasbus.test` |
| PINASBUS Demo Ferries | Shipping Administrator | `shipping.admin@demo-ferries.demo.pinasbus.test` |
| PINASBUS Demo Ferries | Vessel Operator | `vessel.operator@demo-ferries.demo.pinasbus.test` |
| PINAS Card (demo issuer) | Card Administrator | `card.admin@pinas-card.demo.pinasbus.test` |

The regular demo passenger has a linked PINAS Card with a ₱1,000 opening balance. Administrator and finance accounts must set up two-step sign-in (an authenticator app) at first use.

## Things to try

- **Isolation:** as the Bicol Isarog administrator, open `/ops/victory-liner`. You are refused.
- **Crew scope:** as the Victory Liner dispatcher, assign the demo driver to a trip. The driver then sees only that trip under **My trips**.
- **Priority seats:** as the regular passenger, seat 1 (♿) offers only the PWD type. The PWD passenger can book it with an ID type and last 4 characters.
- **Terminal sale:** as the cashier, open a manifest and sell a seat for cash; it appears in the manifest and the audit log.
- **Payment:** the PayMongo test card `4343 4343 4343 4345`, any future expiry, CVC `123`.
- **Pay with a card:** as the regular passenger, choose the PINAS Card under **Pay with**.
- **Baggage:** register a 25 kg bag on that ticket, then as the Victory Liner baggage handler scan or enter its tag. Loading is refused until the excess fee is collected.
- **Ferry:** as the Bicol Isarog dispatcher, open a Masbate or Virac trip manifest and **Book ferry**. Open the QR link to record "Waiting", then as the vessel operator record "Boarding".
- **City bus:** search Monumento → Ayala and open **See the line**.
- **Ilocos background:** on the home page choose Partas Cubao → Partas Laoag.

## Demo data and its sources

| Company | What is real | What is indicative |
|---|---|---|
| Bicol Isarog (Isarog Line), Peñafrancia Tours, Legaspi St. Jude, RSL Bus | Trip codes, departure times, bus classes and fares from bicolisarog.com, 2026-11-23 | Stop times after the first pick-up, road itineraries |
| Victory Liner | Terminal names and addresses, bus classes (Wikipedia, 2026-11-24) | Routes, times and fares: their fare page was unavailable |
| Partas | Terminals, destinations, classes (Luxury 28, Deluxe 45, Regular 49) (Wikipedia, 2026-11-24) | Times and fares |
| EDSA Carousel | Stop list Monumento → PITX, 24/7 operation, operators (Wikipedia, 2026-11-24) | Fares and the 30-minute timetable |
| PINASBUS Demo Ferries, PINAS Card | Nothing: fictional demonstration companies | Everything |
| Station coordinates | | Approximate (city or terminal level) |
| Destination photos | Wikimedia Commons, CC BY-SA or CC0, credited on screen (`data/places.json`) | |

Bus plate numbers (`DEMO 1001` and so on) and fleet details are placeholders. None of these companies is affiliated with PINASBUS.
