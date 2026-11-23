# PINASBUS shipping operator guide

For staff of a ferry or shipping company working at `/ship/<company>`.

## Onboarding and roles

The platform administrator registers the company as a **Shipping operator** with a first **Shipping Administrator**, who adds staff:

| Role | Can |
|---|---|
| Shipping Administrator | vessels, ports, sailings, staff, audit log, plus everything a vessel operator does |
| Vessel Operator | update sailing status; scan bus reservations to board, load and unload |

## Setting up

1. **Ports:** add each port with its province, latitude and longitude. The coordinates put the port on the passenger map. Ports are shared with bus companies, whose routes can name them as ferry legs.
2. **Vessels:** set the name, registration, **vehicle slots** (how many buses fit on deck), passenger capacity and status.
3. **Sailings:** choose a vessel, the from and to ports, the first date, the Manila departure time, the crossing time and when boarding opens. You can repeat a sailing daily for up to 60 days.

## How buses connect

A bus company's dispatcher books a sailing for a trip whose route includes your departure port. Only sailings within 36 hours that still have deck space are offered. Each booking is a **reservation** with a reference (`FR…`) and a QR code.

At the port, scan the bus's QR code with your phone camera. It opens the reservation, verifies it, and offers only the steps your role may record:

| Step | Who |
|---|---|
| Approaching the port, Waiting to board, Continuing by road | bus crew |
| Waiting to board, Boarding the vessel, On the vessel, Sailing, Off the vessel, Cancelled | shipping staff |

Every step records who, when and an optional note. It appears on the bus trip's live map and on the passenger's ticket.

## Sailing status

Changing a sailing's status updates all its buses:
- **Boarding**, **Sailing** and **Arrived** move every bus to the matching step. A bus still on the pier is not marked as sailing.
- **Delayed** and **Cancelled** notify every passenger on the linked trips, in-app and by email, with your note.

The **Manifest** for each sailing lists the reserved buses with company, trip, plate, passenger count and status.
