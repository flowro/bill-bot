# Bill Bot Admin Dashboard

Admin dashboard for monitoring Bill Bot users, receipts, and system analytics.

## Features

- **Analytics Overview**: Total users, receipts, daily/weekly/monthly metrics
- **User Management**: View all users with receipt counts and activity
- **Receipt Monitoring**: Recent receipts feed across all users
- **User Detail Views**: Drill down into individual user spending patterns
- **Category Analytics**: Spending breakdown by receipt categories

## Setup

1. **Environment Variables**

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
```

2. **Install and Run**

```bash
npm install
npm run dev
```

3. **Build for Production**

```bash
npm run build
npm start
```

## Database Access

The dashboard uses Supabase with service role access to read:
- `users` table - user profiles and metadata
- `receipts` table - all receipt data
- `jobs` table - user jobs/projects

## Security

- Admin-only access (implement auth before production)
- Uses Supabase service role for full read access
- No write operations from dashboard

## Pages

- `/` - Main dashboard with analytics and recent data
- `/user/[id]` - Individual user detail page

## Stack

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS
- Supabase client

Built for Bill Bot issue #20: Admin dashboard for monitoring users and receipts.