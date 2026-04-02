# Bill Bot — MVP1 Build Plan

> **Goal:** Working Telegram bot that a plumber can use TODAY to photograph receipts, track expenses, and ask questions about spending.
> **Timeline:** Ship in one session. Keep it dead simple.
> **Beta tester:** Jose's brother-in-law (plumber)

---

## Architecture

```
Telegram Bot API
     ↓
Node.js Server (index.js)
     ↓
┌────────────┐    ┌──────────────┐
│ Claude API │    │   Supabase   │
│  (Vision)  │    │  (DB + Storage) │
└────────────┘    └──────────────┘
```

**Stack:**
- Runtime: Node.js
- Bot framework: `grammy` (modern, lightweight, better than node-telegram-bot-api)
- AI: Claude API (claude-3-haiku for cost, sonnet for accuracy)
- Database: Supabase (Postgres + Storage)
- Deployment: Can run locally first, then Railway/Fly.io later

---

## Database Schema (Supabase)

### `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  first_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `jobs`
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  client TEXT,
  status TEXT DEFAULT 'active', -- active, completed
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `receipts`
```sql
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  job_id UUID REFERENCES jobs(id),
  image_url TEXT, -- Supabase Storage URL
  amount DECIMAL(10,2),
  vendor TEXT,
  receipt_date DATE,
  category TEXT, -- materials, fuel, tools, food, labor, vehicle, office, other
  description TEXT,
  raw_ocr_text TEXT, -- full Claude response for debugging
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Storage Bucket
- Bucket name: `receipts`
- Path: `{user_telegram_id}/{uuid}.jpg`
- Public: false (use signed URLs)

### RLS
- Users can only see their own data
- Service role for bot backend

---

## Bot Commands

| Command | What it does |
|---------|-------------|
| `/start` | Welcome message, create user |
| `/help` | Show available commands |
| `/jobs` | List active jobs |
| `/newjob <name>` | Create a new job/client |
| `/summary` | This month's spending summary |
| `/summary <month>` | Specific month summary |
| `/export` | Export CSV of all receipts |
| `/export <month>` | Export specific month |

## Message Handlers (no command needed)

| Input | Bot does |
|-------|----------|
| **Photo** | Download → Claude Vision OCR → classify → save → confirm |
| **Photo + caption** | Same as above, caption used as job tag or notes |
| **Text question** | Parse with AI → query DB → respond |
| **Forward a document** | If PDF/image, treat as receipt |

---

## Core Flows

### Flow 1: Receipt Photo Processing

```
User sends photo
  → Bot replies: "📸 Processing..."
  → Download photo from Telegram
  → Upload to Supabase Storage
  → Send to Claude Vision with prompt:
      "Extract from this receipt:
       - amount (number only)
       - vendor/store name
       - date (YYYY-MM-DD)
       - category (materials|fuel|tools|food|labor|vehicle|office|other)
       - brief description
       Return as JSON."
  → Parse response
  → Insert into receipts table
  → Reply: "✅ Got it!
    📍 Home Depot
    💰 $47.82
    📁 Materials
    📅 2026-04-01
    🏷️ No job tagged
    
    Reply with a job name to tag it."
```

### Flow 2: Natural Language Queries

```
User: "How much did I spend this month?"
  → Send to Claude with context:
      "User asked: {question}
       Generate a Supabase query for the receipts table.
       User timezone: America/Chicago
       Available columns: amount, vendor, receipt_date, category, job.name
       Return: SQL query + human-readable answer format"
  → Execute query
  → Format response:
      "📊 March 2026 Summary
       Total: $1,247.33
       
       By category:
       🔧 Materials: $623.50 (12 receipts)
       ⛽ Fuel: $312.80 (8 receipts)
       🍔 Food: $187.03 (15 receipts)
       🔨 Tools: $124.00 (2 receipts)"
```

### Flow 3: Job Tagging

```
User sends photo with caption "Johnson bathroom"
  → Process receipt (Flow 1)
  → Check if job "Johnson bathroom" exists
    → If no: create job, ask to confirm
    → If yes: tag receipt to job
  → Reply includes job tag

OR

User replies to receipt confirmation with "Johnson bathroom"
  → Same logic, update the receipt
```

### Flow 4: Weekly/Monthly Summary (Cron)

```
Every Sunday 7 PM:
  → Query all receipts for the week
  → Format summary by category + job
  → Send to user via Telegram

1st of month:
  → Same but for full month
  → Include comparison to previous month
```

### Flow 5: Export

```
User: /export or /export 2026-03
  → Query receipts for period
  → Generate CSV (date, vendor, amount, category, job, description)
  → Send as Telegram document
```

---

## Claude Vision Prompt (Receipt OCR)

```
You are a receipt/invoice parser for a tradesperson (plumber, builder, electrician).

Extract the following from this receipt image:
- amount: the total amount paid (number, no currency symbol)
- vendor: store/supplier name
- date: date of purchase (YYYY-MM-DD format)
- category: one of [materials, fuel, tools, food, labor, vehicle, office, other]
- description: brief description of what was purchased (max 50 chars)

For category guidance:
- materials = building supplies, plumbing parts, pipes, fittings, lumber, concrete
- fuel = gas, diesel, vehicle fuel
- tools = power tools, hand tools, equipment
- food = meals, coffee, snacks
- labor = subcontractor payments, helper wages
- vehicle = vehicle maintenance, tires, oil change
- office = phone, software, insurance, licenses

Return ONLY valid JSON:
{"amount": 47.82, "vendor": "Home Depot", "date": "2026-04-01", "category": "materials", "description": "PVC pipes and fittings"}

If you can't read something, use null for that field.
```

---

## File Structure

```
bill-bot/
├── package.json
├── .env.example          # TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY
├── .env                  # (gitignored)
├── src/
│   ├── index.js          # Entry point, bot setup
│   ├── bot/
│   │   ├── commands.js   # /start, /help, /jobs, /newjob, /summary, /export
│   │   ├── handlers.js   # Photo handler, text handler, document handler
│   │   └── keyboards.js  # Inline keyboards for job selection, categories
│   ├── services/
│   │   ├── ocr.js        # Claude Vision API call
│   │   ├── query.js      # Natural language → SQL → response
│   │   └── export.js     # CSV/PDF generation
│   ├── db/
│   │   ├── supabase.js   # Supabase client
│   │   ├── users.js      # User CRUD
│   │   ├── receipts.js   # Receipt CRUD
│   │   └── jobs.js       # Job CRUD
│   └── utils/
│       ├── format.js     # Message formatting helpers
│       └── constants.js  # Categories, prompts
├── supabase/
│   └── migrations/
│       └── 001_init.sql  # Schema creation
└── README.md
```

---

## Environment Variables

```env
# Telegram
TELEGRAM_BOT_TOKEN=       # From @BotFather

# Supabase
SUPABASE_URL=             # Project URL
SUPABASE_SERVICE_KEY=     # Service role key (not anon)

# Anthropic
ANTHROPIC_API_KEY=        # For Claude Vision

# Optional
NODE_ENV=development
LOG_LEVEL=info
```

---

## MVP1 Issues (GitHub)

Build in this order:

1. **#13 — Supabase schema** (P0) — Create tables, storage bucket, RLS
2. **#11 — Telegram bot receives messages** (P0) — grammy setup, photo download
3. **#12 — Claude Vision OCR** (P0) — Receipt processing pipeline
4. **#14 — Natural language queries** (P1) — "How much did I spend?"
5. **#15 — Job tagging** (P1) — Tag receipts to jobs/clients
6. **#16 — Summary reports** (P1) — Weekly/monthly auto-send
7. **#17 — CSV export** (P2) — Export for accountant

---

## Cost Estimate Per User

| Action | Cost |
|--------|------|
| Receipt OCR (Haiku + vision) | ~$0.01-0.03/receipt |
| NL query (Haiku) | ~$0.005/query |
| Supabase (free tier) | $0/mo up to 500MB |
| Telegram Bot API | Free |
| **Average user (50 receipts/mo, 20 queries)** | **~$1.60/mo** |

**Pricing recommendation:** $4.99/mo or $0.10/receipt. Not $0.50/mo — that loses money.

---

## What's NOT in MVP1

- ❌ QuickBooks integration
- ❌ Multi-language
- ❌ Web dashboard
- ❌ Team/multi-user per business
- ❌ Invoice generation
- ❌ Payment processing
- ❌ App stores

Keep it Telegram-only, one user at a time, pure utility. Ship it, get feedback, iterate.

---

## Testing

1. Create a test Telegram bot via @BotFather
2. Jose + brother-in-law added as test users
3. Send real receipts, verify OCR accuracy
4. Test edge cases: blurry photos, handwritten receipts, Spanish receipts, multi-item invoices
5. Verify summaries and exports are accurate
