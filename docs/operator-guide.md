# PINASBUS bus company guide

For staff of a bus company working in its PINASBUS workspace at `/ops/<company>`.

## Getting in

The PINASBUS platform administrator registers your company and its first **Company Administrator**, who receives a one-time password. That administrator adds everyone else under **Staff and roles**. New staff get a one-time password, shown once, and must change it at first sign-in. A person can work for more than one company; each workspace appears under **Your work** in their account.

Your workspace shows only your company's data. Another company's staff, and other companies' URLs, are refused on the server. Platform administrators can look inside read-only, as an auditor.

## Roles

Roles are fixed by PINASBUS; you choose who has which. The full matrix is on the **Staff and roles** page.

| Role | Can |
|---|---|
| Company Administrator | everything below, plus company settings and staff |
| Operations Manager | routes, schedules, dispatch, bookings, reports |
| Dispatcher | see all trips, assign buses and crew, set trip status |
| Ticketing Officer | sell at the terminal, check passengers in |
| Cashier | sell at the terminal, see payments |
| Driver / Assistant Driver | see their assigned trips and manifests |
| Conductor | the above, plus check passengers in |
| Baggage Handler | see trips (baggage tools arrive in phase 2) |
| Fleet Manager | buses, amenities, seat layouts, maintenance status |
| Maintenance Personnel | see the fleet, set maintenance status |
| Finance Officer | bookings, refunds, payments, reports |
| Customer Service | see trips and bookings, mark refunds |
| Auditor | read-only access, including the audit log |

## Setting up service, in order

1. **Seat layouts.** Start from a template or draw your own. Pick a type in the palette (regular, senior citizen, PWD, priority, reserved, driver, conductor, crew, unavailable), then click cells; use **Upper deck** for double-deckers and tick **New seats are sleeper berths** for berths. **Renumber seats front to back** relabels everything (berths become L/U pairs); you can also select a seat and type its label. A layout cannot drop a seat someone holds a ticket for on an upcoming trip.
2. **Fleet.** Register each bus with:
   - its code and plate;
   - make, model and year;
   - the class name passengers see;
   - its category and seat layout;
   - dimensions;
   - the baggage hold limit and the maximum weight per bag;
   - registration expiry and inspection status;
   - its amenities.

   Add your own amenities if the shared list lacks one. Passenger capacity and decks come from the layout. **Status** (active, maintenance, retired) is what Maintenance staff change.
3. **Routes.** One stop per line: `station | minutes after departure | fare from the first stop | P/D`, for example `Alabang | 60 | 0 | P`. Fares are cumulative, so a passenger pays the difference between their two stops. Roads and crossings, one per line: `expressway | South Luzon Expressway (SLEX) | Magallanes | Santo Tomas | toll`. Any `ferry` line marks the route as including sea travel. New station names are added to the station list automatically.
4. **Schedules.** Set the route, trip code, departure time, operating days and validity dates (use the end date for seasonal or holiday runs). Then set the seat layout, a default bus (optional), the class name, amenities to show when no bus is assigned, and a fare adjustment in percent (for example +10 for a holiday run). Dated trips are created for every operating day. Changes reach future trips that have not sold seats yet.
5. **Company settings.** Set contact details and the **priority seat release**: how many hours before departure unsold senior, PWD and priority seats open to everyone (0 keeps them reserved), and which kinds that applies to. Also set **fare discounts** per passenger type. PINASBUS does not decide these numbers; set what the law and your franchise require (see [compliance.md](compliance.md)).

## Daily operations

- **Trips and dispatch:** pick a date and open a trip to assign a bus, a driver and a conductor (only staff with those roles are offered), and set its status: scheduled, boarding, departed, arrived or cancelled. Online sales stop once a trip leaves *scheduled*, and an hour before each stop's departure.
- **Manifest** (from any trip): every seat with passenger, type and the discount ID to check, segment, ticket reference and channel. **Check in** marks a passenger as boarded.
- **Sell at the terminal:** cash sale with no online fee. The seat list starts with regular seats. Priority seats sell only to eligible passengers until released. Check the discount ID, then record its type and last 4 characters.
- **Bookings:** search by reference, name, email or phone and filter by date and status. **Mark refunded** after you refund in PayMongo (online) or in cash (terminal); the seats go back on sale.
- **Overview:** today's trips; collected revenue, seats sold, online and terminal split and top segments over the last 30 days (for roles with reports).
- **Audit log:** every change in your workspace and every automatic priority-seat release.

## Baggage (phase 2)

**Baggage** is for Baggage Handlers, Ticketing Officers, Conductors and administrators.
- Scan a bag tag with the phone camera, or type it. Record the next step with where it is and a note.
- A bag with an unpaid excess fee can't be **Loaded** until you tick **Fee collected**.
- **Print tag** gives a QR label for the bag.
- **Bags by trip** lists every bag with its weight and fee, and the hold total.
- Set the free allowance, excess fee and bags per seat in **Company settings**, and per-bag and hold limits on each bus in **Fleet**.

## Live tracking (phase 3)

- **Crew:** on an assigned trip that is boarding or departed, the manifest shows **Share bus location from this phone**. It sends GPS every 15 seconds while switched on.
- **Live tracking page** (for dispatch, operations and fleet roles): every bus on the road with its speed, average and top speed, distance remaining and ETA, and whether the position is live or simulated.
- **Alerts:** open alerts for speeding, leaving the route and unusual stops, each with a map link and an **Acknowledge** button. Alerts are also sent to administrators and dispatchers as notifications.
- **Thresholds:** set the speed limit, the off-route distance and the unusual-stop minutes in **Company settings**. Simulated positions never raise alerts.

## Ferry connections (phase 4)

On a trip whose route includes a ferry leg, **Ferry connection** offers sailings from that port within 36 hours that have deck space. **Book ferry** creates a reservation with a QR code. The crew scans or opens it at the port to record approaching, waiting and back on the road; port staff record boarding, on the vessel, sailing and unloading. Passengers see each step on the live map.

## Payments

**Company settings → Payment methods:** online payments through PayMongo and cash at the terminal are always on. Tick **Accept transport cards** to let passengers pay with PINASBUS-supported cards.
