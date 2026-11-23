# BikolBus admin guide

For terminal, support and operations staff with an admin account.

## Getting admin rights

- An email listed in the Helm value `adminEmails` becomes an admin when it signs up or signs in.
- An existing admin can promote anyone at **Admin → Users → Make admin** (and remove it again). You cannot change your own role.

## Dashboard (`/admin`)

Last 30 days, Manila time: collected online, convenience fees, seats sold, paid bookings; charts of revenue, seats and Padala per day, new accounts per day, and the top routes. Each chart has a **Table view** with exact values. Yellow cards link to work waiting: refunds due, Padala to move, unanswered messages.

## Bookings (`/admin/bookings`)

Search by reference, name, email or phone; filter by travel date and status.

| Status | Meaning |
|---|---|
| pending | Seats held, customer is on the payment page (15 minutes) |
| paid | Ticket valid |
| expired | Hold ran out without payment; seats back on sale |
| needs_refund | Money arrived but the seats were resold after the hold expired, or the amount was wrong. Seats are not blocked |
| refunded | Staff refunded it |

**Refund:** refund the payment in the PayMongo dashboard first, then press **Mark refunded**. Marking a paid booking refunded also puts its seats back on sale.

## Routes and trips (`/admin/trips`)

Every trip has an id (e.g. `z3-s`), a code shown to passengers, a direction, a bus class, a fare per seat, pick-ups and drop-offs.

- **Pick-ups:** one per line, station name then 24-hour time: `EDSA Cubao 20:00`.
- **Drop-offs:** one station per line.
- **Running:** untick to stop sales without losing history.

These lists drive every From → To dropdown on the site: a customer can only choose a pair that some running trip serves, and Padala only between such terminals. Searches reflect a change within 15 seconds. A station cannot be both a pick-up and a drop-off on one trip.

## Padala (`/admin/padala`)

Open a shipment to see sender and recipient details and move it along: **Received at the origin terminal → On the bus → Ready for pick-up → Claimed** (or **Cancelled**). The note you add appears on the public tracking timeline, so keep it factual ("Loaded on trip Z3").

**Rates:** base (PHP), per kg (PHP), maximum weight and valuation %. New shipments use them immediately; existing ones keep the fee they paid.

## Users and messages

**Users** lists accounts with their paid bookings and saved passengers. **Messages** is the contact-form inbox: reply by email (the address is a mailto link), then **Mark as done**.

## Password resets

There is no self-service reset email yet. To reset a customer's password, run the snippet in [operations.md](operations.md#reset-a-customer-password) after confirming their identity.
