# Digital Heroes
Two Vercel projects from one repo: `server/` (Express API, Root Directory = server) and `client/` (Vite React, Root Directory = client).
1. Supabase (new project): run `supabase/schema.sql`. Add charities. Promote an admin: `update profiles set role='admin' where email='you@x.com';`
2. Deploy server with env vars from `server/.env.example`. Stripe webhook URL: `<server>/api/webhook` (events: checkout.session.completed, customer.subscription.updated/deleted).
3. Deploy client with `client/.env.example` vars (VITE_API_URL = server URL).
Assumptions: 50% of each fee funds the prize pool, yearly counts as 1/12 monthly, winner proof is a screenshot link.
"# digital_heroes" 
"# digital_heroes" 
