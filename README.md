# YardPilot

YardPilot is a quote-to-booking tool for small landscaping operators.

The wedge is intentionally narrow: give landscapers a self-serve quote page for high-intent homeowner jobs, then convert accepted quotes into paid bookings and Google Calendar events. This avoids competing head-on with full CRMs like Jobber, Yardbook, and LMN.

## Best Marketable Wedge

The most marketable version is:

> Instant quote-to-booking pages for landscapers who lose jobs because they reply too slowly.

Why this wedge is stronger than a broad landscaping CRM:

- Landscapers understand the pain immediately during spring rush.
- Homeowners want a fast answer, not a sales call.
- The product can be sold with a simple promise: "Get a quote page live today."
- It can start with cleanup, mulch, mowing, aeration, and small installs.
- Calendar and payment integrations are natural after quote acceptance.

## Launch MVP

The first paid beta should include:

- Public quote request page for one landscaping business.
- Services and pricing rules: mowing, cleanup, mulch, aeration, small installs.
- Lead dashboard with statuses: New, Quoted, Followed up, Won, Lost.
- AI estimate/proposal draft.
- SMS/email follow-up copy.
- Stripe subscription for the landscaper.
- Optional deposit/payment link for accepted jobs.
- Google Calendar event creation after booking.

## Run Locally

```bash
pnpm install
pnpm dev
```

## Get It Live

Fastest production path:

1. Create the Supabase project and run the schema below.
2. Push this repo to GitHub.
3. Import the GitHub repo into Vercel.
4. Add these Vercel environment variables:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

5. Deploy from Vercel.
6. Test the live app URL.
7. Add a custom domain when the first version is working.

Vercel settings:

- Framework preset: Vite
- Build command: `pnpm build`
- Output directory: `dist`
- Install command: `pnpm install`

The app includes [vercel.json](/Users/kalebmartin/Desktop/bidpilot/vercel.json) so future client routes like `/quote/acme-landscaping` resolve to the React app.

## Supabase Setup

Supabase gives YardPilot auth, Postgres, row-level security, and a place for Stripe and Google Calendar state.

1. Create a project at `https://database.new`.
2. In Supabase, open `SQL Editor`.
3. Paste and run [supabase/schema.sql](/Users/kalebmartin/Desktop/bidpilot/supabase/schema.sql).
4. In the project dashboard, open `Connect` or `Settings > API Keys`.
5. Copy the Project URL and Publishable key.
6. Create `.env.local` from `.env.example`.

```bash
cp .env.example .env.local
```

Then fill in:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Restart the dev server after changing env vars.

The browser app may use the publishable key. Do not put the Supabase secret key or service role key in any `VITE_` variable. Those belong only in server-side endpoints for Stripe webhooks, Google OAuth callbacks, and privileged database writes.

## Stripe Subscription Plan

Use Stripe Checkout for subscriptions first.

Required Stripe setup:

- Create products/prices in Stripe for Solo, Pro, and Crew.
- Store the Stripe price IDs in server env vars.
- Add a `POST /api/stripe/create-checkout-session` endpoint.
- Add a `POST /api/stripe/webhook` endpoint.
- Save `stripe_customer_id`, `stripe_subscription_id`, and `subscription_status` on the user account.

Recommended env vars:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SOLO=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_CREW=price_...
APP_URL=http://localhost:5173
```

## Google Calendar Booking Plan

Use Google OAuth per operator. YardPilot should create events on the service provider's calendar, not on a shared app calendar.

Required Google setup:

- Create a Google Cloud project.
- Enable the Google Calendar API.
- Configure OAuth consent.
- Add a web OAuth client.
- Add redirect URI: `http://localhost:5173/api/google/oauth/callback` for local development.

Suggested event shape:

```json
{
  "summary": "Spring cleanup - Maya Chen",
  "description": "Property: 0.25 acre corner lot\nQuote: $595\nNotes: Leaf cleanup, bed edging, first mow, and haul-away.",
  "start": {
    "dateTime": "2026-06-27T10:00:00-06:00"
  },
  "end": {
    "dateTime": "2026-06-27T13:00:00-06:00"
  }
}
```

## Data Model

Minimum tables:

- `profiles`: auth user, business name, Stripe customer ID, subscription status.
- `calendar_connections`: user ID, provider, encrypted refresh token, selected calendar ID.
- `leads`: user ID, customer, property details, service, notes, status, quoted price.
- `bookings`: lead ID, start time, end time, Google event ID, booking status.
- `pricing_rules`: user ID, service name, base price, property and complexity fees.

## Implementation Order

1. Add Supabase auth and persist leads.
2. Build a public quote request page at `/quote/:businessSlug`.
3. Add pricing rules and estimate generation.
4. Add Stripe Checkout for landscaper subscriptions.
5. Add Google OAuth and real booking events.
6. Add payment/deposit links for accepted jobs.
7. Add missed-lead recovery from Gmail/SMS/forms.

## First Customer Sprint

1. Pick one local geography.
2. Build three demo quote pages: cleanup, mulch, weekly mowing.
3. DM/call 100 landscapers with: "I made you an instant quote page that can book jobs to your calendar."
4. Offer setup for $0 and charge $49/month after they receive their first real lead through it.
5. Watch every first user try to price a job, then adjust the pricing rule UI.

References:

- [Supabase React quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Stripe Checkout](https://docs.stripe.com/payments/checkout/how-checkout-works)
- [Stripe webhooks](https://docs.stripe.com/webhooks)
- [Google Calendar events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
