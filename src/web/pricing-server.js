// Simple Express server for Stripe checkout and webhooks
// Created for issue #22: Pricing model + Stripe integration

const express = require('express');
const StripeService = require('../stripe/stripe-service');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const stripeService = new StripeService();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Middleware
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.static('public'));

// Routes

// GET /pricing - Show pricing page
app.get('/pricing', (req, res) => {
  const pricing = stripeService.getPricingInfo();
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bill Bot - Pricing</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .tier { border: 2px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .tier.pro { border-color: #0066cc; }
        .tier.business { border-color: #ff6600; }
        .price { font-size: 2em; font-weight: bold; color: #333; }
        .features { list-style-type: none; padding: 0; }
        .features li { padding: 5px 0; }
        .features li:before { content: "✓ "; color: green; font-weight: bold; }
        .button { 
          background: #0066cc; color: white; padding: 12px 24px; 
          border: none; border-radius: 4px; cursor: pointer; 
          text-decoration: none; display: inline-block; margin: 10px 0;
        }
        .button:hover { background: #0052a3; }
      </style>
    </head>
    <body>
      <h1>Bill Bot Pricing</h1>
      <p>Simple expense tracking for tradespeople via Telegram bot.</p>
      
      <div class="tier">
        <h2>Free</h2>
        <div class="price">$0/month</div>
        <ul class="features">
          ${pricing.free.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <p><em>Perfect for trying out the bot</em></p>
      </div>
      
      <div class="tier pro">
        <h2>Pro</h2>
        <div class="price">$${pricing.pro.price}/month</div>
        <ul class="features">
          ${pricing.pro.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="/checkout?tier=pro" class="button">Upgrade to Pro</a>
      </div>
      
      <div class="tier business">
        <h2>Business</h2>
        <div class="price">$${pricing.business.price}/month</div>
        <ul class="features">
          ${pricing.business.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="/checkout?tier=business" class="button">Upgrade to Business</a>
        <p><em>Coming soon - contact us for early access</em></p>
      </div>
      
      <h3>Getting Started</h3>
      <ol>
        <li>Start a chat with @BillTrackingBot on Telegram</li>
        <li>Send /start to create your account</li>
        <li>Take photos of receipts - we'll extract the details automatically</li>
        <li>Ask questions like "How much did I spend this month?"</li>
        <li>Upgrade when you need more than 20 receipts/month</li>
      </ol>
    </body>
    </html>
  `);
});

// GET /checkout?tier=pro&telegram_id=12345
app.get('/checkout', async (req, res) => {
  try {
    const { tier, telegram_id } = req.query;
    
    if (!tier || !telegram_id) {
      return res.status(400).json({ error: 'Missing tier or telegram_id' });
    }

    if (!['pro', 'business'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Get user info from database
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const session = await stripeService.createCheckoutSession(
      parseInt(telegram_id),
      tier,
      {
        first_name: user.first_name,
        telegram_username: user.telegram_username
      }
    );

    res.redirect(session.url);
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// GET /success?session_id=xyz
app.get('/success', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Success!</title></head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
      <h1>🎉 Welcome to Bill Bot Pro!</h1>
      <p>Your subscription is now active.</p>
      <p>Go back to Telegram and start tracking unlimited receipts!</p>
      <a href="https://t.me/BillTrackingBot">Open Telegram Bot</a>
    </body>
    </html>
  `);
});

// GET /cancel
app.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Cancelled</title></head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
      <h1>Subscription Cancelled</h1>
      <p>No worries! You can always upgrade later.</p>
      <p><a href="/pricing">View Pricing</a></p>
      <p><a href="https://t.me/BillTrackingBot">Back to Bot</a></p>
    </body>
    </html>
  `);
});

// GET /portal?customer_id=xyz
app.get('/portal', async (req, res) => {
  try {
    const { customer_id } = req.query;
    
    if (!customer_id) {
      return res.status(400).json({ error: 'Missing customer_id' });
    }

    const session = await stripeService.createPortalSession(
      customer_id,
      `${req.protocol}://${req.get('host')}/pricing`
    );

    res.redirect(session.url);
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// POST /webhook - Stripe webhooks
app.post('/webhook', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const result = await stripeService.handleWebhook(req.body, sig);
    res.json(result);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'bill-bot-pricing' });
});

module.exports = app;

// Start server if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Pricing server running on http://localhost:${PORT}`);
    console.log(`Pricing page: http://localhost:${PORT}/pricing`);
  });
}