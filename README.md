# Interior Blinds CRM

Responsive Next.js 16 CRM foundation for Interior Blinds & Shutters. It includes the operational dashboard, sales, jobs, tasks, warehouse, finance, administration, Master Control, notifications and internal chat views from the supplied PRD.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Authentication configuration is required before protected CRM screens can be opened.

## Connect Supabase

Copy `.env.example` to `.env.local` and add:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Once configured, the CRM layout requires a valid cookie session and an active row in `profiles`. The browser never receives a service-role or secret key. Session refresh lives in `proxy.ts`; trusted stock, quote acceptance, payments, user administration, locks and impersonation must remain RPC/Edge Function workflows.

For a new project, run `supabase/migrations/202608140001_auth_foundation.sql` in the SQL Editor. It creates the account profile, approval status, roles, row-level security rules and automatic signup profile trigger. Sign up once, then run the bootstrap statement at the bottom of that migration to activate the first administrator.

In Authentication → URL Configuration, set the Site URL to your app URL and add `http://localhost:3000/auth/callback` as a local redirect URL. Add the production callback URL before deployment.

## Focused checks

```bash
npx tsc --noEmit
npm run lint
```
