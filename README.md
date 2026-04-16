# VRT Ledger

VRT Ledger is a production-ready club expense management dashboard built with React, Vite, Tailwind CSS, and Supabase.

It supports role-aware access (admin, treasurer, member), cloud-synced expense records, receipt uploads, CSV export, and a clean finance-first interface suitable for real operational use.

## Key Features

- Role-aware workflow for admin, treasurer, and member sessions
- Expense creation with validation (item, amount, quantity, date, category)
- Supabase-backed persistence for expense records
- Receipt upload to Supabase Storage
- In-app receipt preview modal
- Duplicate submission guard
- CSV export for privileged finance roles
- Responsive UI optimized for desktop and mobile

## Tech Stack

- React + Vite
- Tailwind CSS
- Lucide React icons
- Supabase (Postgres + Storage)

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

## Local Development

```bash
npm install
npm run dev
```

## Quality Checks

```bash
npm run lint
npm run build
```

## Supabase Setup

1. Create a Supabase project.
2. Copy Project URL and anon/publishable key into `.env`.
3. Run `supabase-schema.sql` in Supabase SQL Editor.
4. Confirm Storage bucket `vrt-ledger-receipts` exists and policies are active.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Add environment variables in Vercel Project Settings:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`
4. Deploy using default Vite build settings:
	- Build Command: `npm run build`
	- Output Directory: `dist`

## Suggested Repository Metadata

- Repository name: `vrt-ledger-cloud-dashboard`
- Description: `Production-ready club expense management dashboard with role-based workflows, Supabase persistence, receipt storage, and CSV finance export.`
