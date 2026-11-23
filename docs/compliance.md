# Compliance: what must be validated before production

For the legal and compliance reviewers, and whoever approves a production launch. PINASBUS does not invent regulatory rules: the values below are configurable defaults chosen for the demonstration. Each needs validation by counsel or the regulator before real operation.

| Area | What the system does now | Needs validation |
|---|---|---|
| Senior citizen discount (RA 9994) | Default 20% off the fare, per company; ID type and last 4 characters recorded; ID checked at boarding | Exact rate and coverage per fare class, whether the online convenience fee is discountable, VAT treatment, documentation required |
| PWD discount (RA 10754) | Default 20% off, same handling | Same as above |
| Student discount (RA 11314) | Default 20% off, same handling | Applicability to provincial and premium classes, school-day and holiday rules |
| Child fares | Default 0%, configurable | Operator franchise rules |
| Priority and accessible seating | Seats can be marked senior citizen, PWD or priority; reserved for eligible passengers until a company-set deadline (default 2 hours before departure), then released to everyone; sold seats are never released; each release is audited | Whether release is permitted at all for each franchise, minimum number of priority seats per bus type, LTFRB memorandum circulars |
| Fares | Companies enter their own fares per route, with an optional per-schedule adjustment | Must match LTFRB-approved fare matrices per franchise; holiday surcharges |
| Online convenience fee | 5.2% + ₱16 per seat (the rate the source operators charge) | Consumer Act disclosure, whether it can be charged on discounted fares |
| Personal data (RA 10173) | Minimal fields; only the ID type and last 4 characters; public tracking masks names; account deletion; audit log | Privacy impact assessment, NPC registration, retention periods, data processing agreements with each operator and PayMongo |
| Payments (PCI DSS) | Hosted PayMongo checkout; no card data touches PINASBUS; signed webhooks; idempotent confirmation | PayMongo merchant agreements per operator, settlement and split payments, refund SLAs |
| Demo data | Real operator names and public data, labelled unaffiliated, with sources and dates | Remove or obtain permission before any production use |
| Maps and routing | OpenFreeMap vector tiles (OpenStreetMap data, attribution shown); road lines from the public OSRM demo router, cached per route | OSRM demo server terms forbid heavy use: self-host OSRM or Valhalla before production; confirm OpenFreeMap terms for your traffic |
| Location data | Crew phones share GPS only while switched on, for assigned trips; points are stored per trip | Retention period for GPS points, crew consent and notice |
| Speed limits | Company-set threshold (default 80 km/h) for alerts | Applicable LTFRB and road speed limits per road class |
| AI assistant | Gemini (Google) receives the conversation and tool results such as schedules and ticket status by reference; no card or ID data is sent | Data-processing terms with Google, disclosure in the privacy notice, retention |
| Baggage charges | Company-set allowance and excess fee | Must match approved tariffs |
| Stored-value cards | Issuer adapter; PINASBUS keeps no balance of its own | BSP e-money or stored-value rules for issuers; agreements per issuer |
