// Stripe service for bill-bot subscription management
// Created for issue #22: Pricing model + Stripe integration

const Stripe = require('stripe');

class StripeService {
  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable required');
    }
    
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    // Pricing config
    this.PRICING = {
      pro: {
        name: 'Pro',
        price: 4.99,
        priceId: process.env.STRIPE_PRO_PRICE_ID,
        receiptLimit: -1, // unlimited
        features: ['Unlimited receipts', 'Job tagging', 'CSV export', 'Monthly reports']
      },
      business: {
        name: 'Business', 
        price: 14.99,
        priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
        receiptLimit: -1, // unlimited
        features: ['Everything in Pro', 'Multi-user', 'Team dashboard', 'QuickBooks sync (coming soon)']
      }
    };
  }

  // Create or get Stripe customer
  async getOrCreateCustomer(telegramId, userData = {}) {
    try {
      // Try to find existing customer
      const customers = await this.stripe.customers.list({
        metadata: { telegram_id: telegramId.toString() },
        limit: 1
      });

      if (customers.data.length > 0) {
        return customers.data[0];
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email: userData.email || null,
        name: userData.first_name || `User ${telegramId}`,
        metadata: {
          telegram_id: telegramId.toString(),
          telegram_username: userData.telegram_username || null
        }
      });

      return customer;
    } catch (error) {
      console.error('Error creating/getting Stripe customer:', error);
      throw error;
    }
  }

  // Create checkout session for subscription
  async createCheckoutSession(telegramId, tier, userData = {}) {
    try {
      if (!this.PRICING[tier]) {
        throw new Error(`Invalid subscription tier: ${tier}`);
      }

      const customer = await this.getOrCreateCustomer(telegramId, userData);
      
      const session = await this.stripe.checkout.sessions.create({
        customer: customer.id,
        line_items: [{
          price: this.PRICING[tier].priceId,
          quantity: 1
        }],
        mode: 'subscription',
        success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/cancel`,
        metadata: {
          telegram_id: telegramId.toString(),
          tier: tier
        }
      });

      return session;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }

  // Create customer portal session
  async createPortalSession(stripeCustomerId, returnUrl) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl || `${process.env.BASE_URL || 'http://localhost:3000'}`
      });

      return session;
    } catch (error) {
      console.error('Error creating portal session:', error);
      throw error;
    }
  }

  // Get subscription details
  async getSubscription(subscriptionId) {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error('Error getting subscription:', error);
      throw error;
    }
  }

  // Handle webhook events
  async handleWebhook(rawBody, signature) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log('Stripe webhook received:', event.type);

      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object);
          break;
          
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionChange(event.data.object);
          break;
          
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
          
        default:
          console.log('Unhandled webhook event:', event.type);
      }

      return { received: true };
    } catch (error) {
      console.error('Webhook error:', error);
      throw error;
    }
  }

  async handleCheckoutCompleted(session) {
    console.log('Checkout completed for customer:', session.customer);
    
    try {
      const telegramId = session.metadata.telegram_id;
      const tier = session.metadata.tier;
      
      if (!telegramId || !tier) {
        console.error('Missing metadata in checkout session:', session.id);
        return;
      }
      
      // Update user subscription in database
      const supabase = require('@supabase/supabase-js').createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      const { error } = await supabase
        .from('users')
        .update({
          stripe_customer_id: session.customer,
          subscription_tier: tier,
          subscription_status: 'active'
        })
        .eq('telegram_id', parseInt(telegramId));
        
      if (error) {
        console.error('Error updating user subscription:', error);
      } else {
        console.log(`Updated subscription for user ${telegramId} to ${tier}`);
      }
    } catch (error) {
      console.error('Error in handleCheckoutCompleted:', error);
    }
  }

  async handleSubscriptionChange(subscription) {
    console.log('Subscription changed:', subscription.id);
    
    try {
      const supabase = require('@supabase/supabase-js').createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      const status = subscription.status; // active, canceled, past_due, etc.
      const periodStart = new Date(subscription.current_period_start * 1000);
      const periodEnd = new Date(subscription.current_period_end * 1000);
      
      const { error } = await supabase
        .from('users')
        .update({
          subscription_status: status,
          subscription_current_period_start: periodStart.toISOString(),
          subscription_current_period_end: periodEnd.toISOString(),
          stripe_subscription_id: subscription.id
        })
        .eq('stripe_customer_id', subscription.customer);
        
      if (error) {
        console.error('Error updating subscription status:', error);
      } else {
        console.log(`Updated subscription ${subscription.id} status to ${status}`);
      }
    } catch (error) {
      console.error('Error in handleSubscriptionChange:', error);
    }
  }

  async handlePaymentFailed(invoice) {
    console.log('Payment failed for customer:', invoice.customer);
    
    try {
      const supabase = require('@supabase/supabase-js').createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      // Get user info
      const { data: user } = await supabase
        .from('users')
        .select('telegram_id, first_name')
        .eq('stripe_customer_id', invoice.customer)
        .single();
        
      if (user) {
        console.log(`Payment failed for user ${user.telegram_id} (${user.first_name})`);
        // TODO: Send notification via Telegram bot about payment failure
      }
    } catch (error) {
      console.error('Error in handlePaymentFailed:', error);
    }
  }

  // Get pricing info for display
  getPricingInfo() {
    return {
      free: {
        name: 'Free',
        price: 0,
        receiptLimit: 20,
        features: ['20 receipts/month', 'Basic reports', 'Telegram bot access']
      },
      ...this.PRICING
    };
  }

  // Format price for display
  formatPrice(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

module.exports = StripeService;