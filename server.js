#!/usr/bin/env node
// Bill Bot - Combined server (Telegram bot + pricing/webhook server)
// Created for issue #22: Pricing model + Stripe integration

require('dotenv').config();
const pricingApp = require('./src/web/pricing-server');

// Start pricing/webhook server
const PORT = process.env.PORT || 3000;
pricingApp.listen(PORT, () => {
  console.log(`💳 Pricing server running on http://localhost:${PORT}`);
  console.log(`📊 Pricing page: http://localhost:${PORT}/pricing`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});

// Start Telegram bot
console.log('🤖 Starting Telegram bot...');
require('./index.js');

console.log(`
🎉 Bill Bot services started!

📊 Web Interface:
   Pricing: http://localhost:${PORT}/pricing
   Health: http://localhost:${PORT}/health

🤖 Telegram Bot: Running in background

🔧 Environment: ${process.env.NODE_ENV || 'development'}
`);