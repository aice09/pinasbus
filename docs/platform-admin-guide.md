# PINASBUS platform administrator guide

For the people who run the PINASBUS platform itself, at `/platform`.

## Becoming a platform administrator

Only emails in the Helm value `platformAdminEmails` (env `PLATFORM_ADMIN_EMAILS`) become platform administrators, when they sign in. There is no in-app way to grant it, so a compromised company account cannot escalate. The demo platform-admin account stays disabled unless `demo.platformAdmin=true`.

## Pages

| Page | Use |
|---|---|
| Overview | 30-day revenue, seats, Padala and sign-ups across the platform; a per-company table (buses, routes, trips today, seats, revenue) linking into each workspace |
| Companies | Register a bus company, card issuer or shipping operator with its first administrator, who gets a one-time password. Suspend or reactivate a company: suspended companies' trips disappear from search and their staff are locked out of the workspace. Each company shows its data sources. **Reset demo data** reloads the demo companies and accounts and leaves real companies alone |
| Transport categories | City, provincial, P2P, airport, tourist, express, premium, ordinary, school, or any new one, with booking rules (max seats per booking, days ahead). Adding one needs no code change |
| All bookings | Every company's bookings, for support and refunds |
| Padala | Shipments, status updates with notes the sender sees, and rates |
| Users | Every account and the companies and roles it holds. **Disable** signs the person out and blocks sign-in |
| Messages | Contact-form inbox |
| Audit log | Every administrative change and automatic seat release across the platform, with who, when and the IP |

Inside a company workspace a platform administrator acts as **Auditor**: read-only. Changes are made by that company's own staff.

## Password resets

There is no self-service reset email yet (phase 6 adds email). Use the snippet in [operations.md](operations.md#reset-a-customers-password) after confirming the person's identity.
