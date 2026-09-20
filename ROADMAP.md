# Digital Heroes Assignment: Roadmap (deadline 22 Sep 2026)

## Setup (1 hour)
1. NEW accounts: Vercel, Supabase, Stripe (test mode). Do not reuse personal ones.
2. Supabase: create project, run supabase/schema.sql, create 4-6 sample charities.
3. Create an admin user: sign up, then `update profiles set role='admin' where email='...'`.

## Day 1: Backend + core logic (server/)
- Deploy server/ to Vercel as its own project (Root Directory = server). Add env vars from .env.example.
- Test with curl/Postman: signup, checkout, scores (try duplicate date, 6th score, 46), charity pct < 10.
- Stripe: add products (monthly, yearly), webhook to /api/webhook.
- Test the draw engine: simulate, publish, winner split, jackpot rollover.

## Day 1 evening: Client (client/, Vite + React + Tailwind + Framer Motion)
- Pages: Home (charity-led hero, how it works, prize tiers, featured charity, big Subscribe CTA), Charities (search/filter) + profile, Pricing, Login/Signup (charity picker), Dashboard (5 modules), Admin (5 tabs).
- Design: NOT golf. Dark or warm palette, big type, subtle motion, charity impact first.

## Day 2: Finish + harden
- Winner proof upload, admin verify + mark paid, reports.
- Responsive check, empty states, error toasts, loading states.
- Deploy client/ as a second Vercel project (Root Directory = client, VITE_API_URL = server URL).
- Run the PRD section 16.1 testing checklist end to end.

## Submission (before 22 Sep)
- Live URL, test user + admin credentials, GitHub repo, short README with architecture and assumptions.
- Ambiguities to document (the PRD says ambiguity is part of the test): prize pool % of fee (set to 50%), yearly fee counted as 1/12 per month, charity share taken from the fee, score ties by date, 3-match minimum.
