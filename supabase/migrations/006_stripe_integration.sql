-- Stripe integration for bill-bot subscription management
-- Created for issue #22: Pricing model + Stripe integration

-- Add subscription fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'business'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'unpaid'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Usage tracking table
CREATE TABLE IF NOT EXISTS user_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- First day of month (e.g., 2026-04-01)
  receipts_processed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure one record per user per month
  UNIQUE(user_id, month)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_user_usage_user_month ON user_usage(user_id, month);

-- Enable RLS
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_usage
CREATE POLICY "Users can view own usage" ON user_usage
  FOR SELECT USING (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

CREATE POLICY "Service role full access to usage" ON user_usage
  FOR ALL USING (auth.role() = 'service_role');

-- Function to get current month usage for a user
CREATE OR REPLACE FUNCTION get_user_monthly_usage(user_telegram_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  usage_count INTEGER;
  user_record RECORD;
BEGIN
  -- Get user
  SELECT * INTO user_record FROM users WHERE telegram_id = user_telegram_id;
  
  IF user_record IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get current month usage
  SELECT COALESCE(receipts_processed, 0) INTO usage_count
  FROM user_usage
  WHERE user_id = user_record.id
    AND month = date_trunc('month', CURRENT_DATE)::date;
    
  RETURN COALESCE(usage_count, 0);
END;
$$;

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_user_usage(user_telegram_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  usage_count INTEGER;
  user_record RECORD;
  current_month DATE;
BEGIN
  -- Get user
  SELECT * INTO user_record FROM users WHERE telegram_id = user_telegram_id;
  
  IF user_record IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  current_month := date_trunc('month', CURRENT_DATE)::date;
  
  -- Upsert usage record
  INSERT INTO user_usage (user_id, month, receipts_processed, updated_at)
  VALUES (user_record.id, current_month, 1, now())
  ON CONFLICT (user_id, month)
  DO UPDATE SET 
    receipts_processed = user_usage.receipts_processed + 1,
    updated_at = now();
  
  -- Return new count
  SELECT receipts_processed INTO usage_count
  FROM user_usage
  WHERE user_id = user_record.id AND month = current_month;
  
  RETURN usage_count;
END;
$$;

-- Function to check if user can process more receipts
CREATE OR REPLACE FUNCTION can_user_process_receipt(user_telegram_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
  usage_count INTEGER;
  tier_limit INTEGER;
BEGIN
  -- Get user
  SELECT * INTO user_record FROM users WHERE telegram_id = user_telegram_id;
  
  IF user_record IS NULL THEN
    RETURN false;
  END IF;
  
  -- Set tier limits
  CASE user_record.subscription_tier
    WHEN 'free' THEN tier_limit := 20;
    WHEN 'pro' THEN tier_limit := -1; -- unlimited
    WHEN 'business' THEN tier_limit := -1; -- unlimited
    ELSE tier_limit := 20;
  END CASE;
  
  -- Unlimited tiers
  IF tier_limit = -1 THEN
    RETURN true;
  END IF;
  
  -- Check current usage
  usage_count := get_user_monthly_usage(user_telegram_id);
  
  RETURN usage_count < tier_limit;
END;
$$;