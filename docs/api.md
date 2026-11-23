# BikolBus HTTP API

For integrators and for debugging. Browser forms use Next server actions, which are not a public API.

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | `200 {"status":"ok"}` when the app reaches Postgres, else `503` |
| `GET /api/seats?trip=<id>&date=YYYY-MM-DD` | none | `{"taken":["L3","U4"]}` seats currently held or sold |
| `POST /api/bookings` | optional session cookie; same-origin | Holds seats and returns `{"ref","checkoutUrl"}` |
| `POST /api/paymongo/webhook` | `Paymongo-Signature` | PayMongo `checkout_session.payment.paid` events |
| `GET /api/metrics` | `Authorization: Bearer <METRICS_TOKEN>` | Prometheus text format; `404` without the token |

## POST /api/bookings

```json
{
  "tripId": "z3-s", "date": "2026-11-30", "pickup": "EDSA Cubao", "dropoff": "Naga CBD",
  "seats": ["12", "13"],
  "name": "Juan Dela Cruz", "email": "juan@example.com", "phone": "09171234567",
  "passengers": [{ "seat": "12", "profileId": "<saved passenger uuid>" }, { "seat": "13", "name": "Maria Dela Cruz" }]
}
```

| Status | Body | When |
|---|---|---|
| 200 | `{"ref":"BB…","checkoutUrl":"https://checkout.paymongo.com/…"}` | seats held for 15 minutes |
| 400 | `{"error":"…"}` | invalid input, route pair not on the trip, booking window closed |
| 403 | `{"error":"Bad origin."}` | cross-site request |
| 404 | `{"error":"That trip is not running."}` | unknown or switched-off trip |
| 409 | `{"error":"…","taken":[…]}` | a seat was taken meanwhile |
| 429 | `{"error":"…"}` | more than 10 attempts a minute from one IP |
| 502 / 503 | `{"error":"…"}` | PayMongo failed / payments not configured |

`profileId` is honoured only for the signed-in user's own saved passengers.
