# Bill Bot - Telegram Bot Setup

> **Telegram bot for receipt tracking and expense management**

## Quick Start

1. **Install dependencies**
```bash
npm install
```

2. **Set up environment**
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Create Telegram Bot**
- Message [@BotFather](https://t.me/BotFather) on Telegram
- Create new bot with `/newbot`
- Get your bot token and add to `.env`

4. **Set up Supabase**
- Create new Supabase project
- Run migrations in `supabase/migrations/`
- Add URL and service role key to `.env`

5. **Run the bot**
```bash
npm start
```

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=sk-ant-your-key
NODE_ENV=development
```

## Features

### Current (MVP1)
- ✅ Receives photo messages (receipts)
- ✅ Saves images to Supabase Storage
- ✅ Basic text message handling
- ✅ User account creation
- ✅ Error handling and confirmation messages

### Coming Soon (MVP2)
- 🔄 Claude Vision OCR processing
- 🔄 Amount/vendor/category extraction
- 🔄 Job/client organization
- 🔄 Spending summaries and reports
- 🔄 Natural language queries
- 🔄 CSV export functionality

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and account setup |
| `/help` | Show available commands |
| `/jobs` | List active jobs (coming soon) |
| `/newjob <name>` | Create new job (coming soon) |
| `/summary` | Monthly spending summary (coming soon) |
| `/export` | Export receipts CSV (coming soon) |

## Message Handlers

- **📸 Photo messages** → Automatically processed and saved
- **💬 Text messages** → Basic responses and help
- **❌ Other types** → Helpful error message

## File Structure

```
bill-bot/
├── index.js                 # Main bot application
├── package.json             # Dependencies and scripts
├── .env.example             # Environment template
├── supabase/
│   └── migrations/          # Database schema
├── uploads/                 # Temporary file storage (gitignored)
└── README.md               # This file
```

## Database Schema

### Tables
- `users` - Telegram user accounts
- `jobs` - Client projects and job tracking  
- `receipts` - Receipt photos with metadata

### Storage
- `receipts` bucket - Photo storage with signed URLs

## Error Handling

The bot includes comprehensive error handling for:
- Database connection failures
- File upload errors
- Telegram API errors
- Invalid message types
- Missing environment variables

## Development

### Local Testing
```bash
npm run dev  # Runs with --watch flag
```

### Logs
All activities are logged to console with timestamps:
- User interactions
- Photo processing
- Database operations
- Errors and warnings

### Deployment Options
- **Local**: Run on your machine
- **Railway**: Simple deployment platform
- **Fly.io**: Docker-based hosting
- **VPS**: Any Linux server with Node.js

## Troubleshooting

### Bot not responding
1. Check bot token is correct
2. Verify bot is added to chat
3. Check console logs for errors

### Database errors  
1. Verify Supabase URL and key
2. Check if migrations have been run
3. Test connection manually

### File upload issues
1. Check Supabase Storage permissions
2. Verify storage bucket exists
3. Check local `uploads/` directory permissions

## Support

- **Issues**: [GitHub Issues](https://github.com/flowro/bill-bot/issues)
- **Docs**: [Supabase Docs](https://supabase.com/docs)
- **Telegram**: [Bot API Docs](https://core.telegram.org/bots/api)