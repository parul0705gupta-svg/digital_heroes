# Digital Heroes
Golf performance + monthly charity prize draw platform. `client/` (React + Vite) and `server/` (Express) deploy as two Vercel projects; data, auth and file storage on Supabase; payments on Stripe.

## Setup
1. Supabase (new project): run `supabase/schema.sql`, then `supabase/migration_2.sql` (adds cancellation/donation columns and the private `proofs` storage bucket). Add charities. Promote an admin: `update profiles set role='admin' where email='you@x.com';`
2. Stripe (test mode): enable the Customer Portal (Settings, Billing, Customer portal, allow cancelling subscriptions). Create a webhook to `<server>/api/webhook` with events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Server env (`server/.env.example`): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, MONTHLY_PRICE, YEARLY_PRICE, PRIZE_POOL_PCT, CLIENT_URL.
4. Client env (`client/.env.example`): VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
5. Vercel: two projects, Root Directory `server` and `client`. Tests: `cd server && npm install && npm test`.

## How it works
- **Scores:** 1-45, one per date, latest 5 kept (database trigger), server validated.
- **Draw:** admin simulates (nothing paid), then publishes (creates winners). Random or frequency-weighted numbers.
- **Prize pool:** PRIZE_POOL_PCT of each active subscriber's monthly fee; 40/35/25 across 5/4/3 matches; equal split inside a tier.
- **Winners:** upload screenshot (private Storage, server-validated PNG/JPG/WebP up to 3 MB) -> admin approves/rejects -> admin marks paid. Rejected winners may resubmit.
- **Subscription:** Stripe Checkout; cancellation through the Stripe Customer Portal; the webhook keeps status in sync (past_due/unpaid = lapsed).
- **Donations:** Stripe Checkout one-off payment, recorded only by the verified webhook, never affects draws.

## Assumptions (PRD is silent)
- Prize pool is 50% of fees (configurable). Yearly plans count as 1/12 per month.
- Eligible for a draw: subscribers with status `active` at simulation time.
- Unclaimed 4-match and 3-match pools are not redistributed or carried over; only the 5-match jackpot rolls over.
- Charity contribution = charity_pct of the subscription fee (minimum 10%).

## Testing
`cd server && npm install && npm test` runs 30+ tests: draw engine, validation, and API tests against a fake Supabase and Stripe (auth, admin access, score rules, charity %, proof ownership, webhook signature and subscription/donation events). The UI is not covered by automated tests.
