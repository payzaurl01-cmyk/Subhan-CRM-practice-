# Interior Blinds CRM

Responsive Next.js 16 CRM foundation for Interior Blinds & Shutters. It includes the operational dashboard, sales, jobs, tasks, warehouse, finance, administration, Master Control, notifications and internal chat views from the supplied PRD.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Without environment variables the project uses clearly labelled preview data so the interface can be reviewed immediately.

## Connect Supabase

Copy `.env.example` to `.env.local` and add:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Once configured, the CRM layout requires a valid cookie session and an active row in `profiles`. The browser never receives a service-role or secret key. Session refresh lives in `proxy.ts`; trusted stock, quote acceptance, payments, user administration, locks and impersonation must remain RPC/Edge Function workflows.

## Focused checks

```bash
npx tsc --noEmit
npm run lint
```
