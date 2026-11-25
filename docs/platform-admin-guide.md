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

People reset their own password from **Forgot your password?** on the sign-in page. If they no longer have access to their email, confirm their identity and use the snippet in [operations.md](operations.md#reset-a-customers-password) after confirming the person's identity.

## Phases 2–6 at the platform level

- **Companies:** also register **Card issuers** and **Shipping operators**. Their first administrator gets the Card Administrator or Shipping Administrator role, and each works in its own workspace (`/cards/<slug>`, `/ship/<slug>`).
- **Two-step sign-in:** required for platform administrators, company administrators, finance officers, and shipping and card administrators (`mfaRequired`). The first visit to a privileged area sends you to **Account → Security** to set it up.
- **Email:** every notification and password reset is written to an outbox and sent by a background job. The bundled Mailpit catches all mail; open its inbox with `kubectl -n bikolbus port-forward svc/bikolbus-mailpit 8025` then http://localhost:8025. For real delivery set `mail.smtpUrl`.
- **AI assistant:** uses the Gemini key in Secret `bikolbus-ai` (copied from AKADEMIA's configuration). Remove the Secret to hide it.
- **Demo data:** reloads automatically when the seed version changes (`DEMO_AUTO_RESET=false` turns that off). **Reset demo data** reloads it on demand. Neither touches real companies.

## Appearance

**Platform > Appearance** sets the colours everyone sees unless they choose their own: one of the built-in palettes or any colorhunt.co palette link. The change is recorded in the audit log.
