# PINASBUS card issuer guide

For staff of a stored-value card issuer working at `/cards/<issuer>`.

## Onboarding

The PINASBUS platform administrator registers the issuer as a **Card issuer** company with a first **Card Administrator**. That administrator adds staff under **Staff and roles**:

| Role | Can |
|---|---|
| Card Administrator | programs, issuing and blocking cards, balance adjustments, staff, audit log |
| Card Finance Officer | view balances, loads and reconciliation |

Two-step sign-in is required for Card Administrators.

## Card programs and cards

1. **Programs and cards → Card programs.** Set:
   - a name;
   - a 4-digit number prefix;
   - the minimum load;
   - the maximum balance.
2. **Add cards to inventory.** Card numbers are 16 digits: your prefix, 11 random digits and a Luhn check digit, so typing mistakes are caught.
3. Hand cards to customers. They link a card in **Account → Transport cards**, which makes it active and names them as holder.
4. **Block** a lost or stolen card. Blocked cards can't pay or load.
5. **Adjust balance:** a correction with a required reason, recorded in the ledger and the audit log.

## Loading and paying

- Passengers load cards online through PayMongo (GCash, Maya, cards). When PayMongo confirms the payment, the load is applied once to your ledger, keyed on its load reference (`LD…`).
- Bus companies that accept cards (company setting) let passengers pay fares with them. The fare is charged to your ledger under the ticket reference. A refunded ticket is credited back to the same card.

## Reconciliation

**Overview** shows the cards, cardholders, stored value (float), spend on fares, and loads per day. **Reconciliation** lists every case where:

- PayMongo was paid but no ledger load exists;
- the amounts differ;
- a PayMongo-channel ledger load has no paid PayMongo record.

An empty list means they match.

## API integration (for real issuers)

PINASBUS never owns a card balance. Every balance change goes through an **issuer adapter** (`lib/cards.ts`):

```ts
interface IssuerAdapter {
  balance(cardId): Promise<number>;
  load({ cardId, amount, reference, channel }): Promise<{ ok, balance } | { ok: false, error }>;   // idempotent by reference
  charge({ cardId, amount, reference, channel }): Promise<...>;
  refund({ cardId, amount, reference, channel }): Promise<...>;
}
```

The bundled `LocalIssuer` is the demo issuer's own ledger (`cards` and `card_ledger`). A real issuer gets its own adapter that calls its card-management API with the same contract, and `issuerFor(orgId)` returns it.

Requirements for that API:
- **Idempotency:** a repeated `load`, `charge` or `refund` with the same reference must not apply twice.
- **Authoritative errors:** insufficient balance, blocked card, limit exceeded.
- **Signed callbacks:** callbacks to PINASBUS must be signed, like the PayMongo webhook.
