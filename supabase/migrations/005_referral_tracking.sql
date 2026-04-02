-- Add referral tracking fields to users table
-- Created for issue #21: QR code onboarding with referral tracking

-- Add referral tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS 
  referral_source TEXT,
  referred_at TIMESTAMPTZ;

-- Create index for referral analytics
CREATE INDEX IF NOT EXISTS idx_users_referral_source ON users(referral_source) WHERE referral_source IS NOT NULL;

-- Function to generate referral codes (simple implementation)
CREATE OR REPLACE FUNCTION generate_referral_code(
  p_prefix TEXT DEFAULT 'user'
) RETURNS TEXT AS $$
DECLARE
  code TEXT;
BEGIN
  -- Generate a simple referral code: prefix_timestamp_random
  code := p_prefix || '_' || extract(epoch from now())::bigint || '_' || (random() * 1000)::int;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Update the get_or_create_user function to handle referral tracking
CREATE OR REPLACE FUNCTION get_or_create_user(
  p_telegram_id BIGINT,
  p_telegram_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_referral_code TEXT DEFAULT NULL
) RETURNS TABLE (
  user_id UUID,
  is_new_user BOOLEAN,
  onboarding_completed BOOLEAN,
  onboarding_step INTEGER
) AS $$
DECLARE
  existing_user_id UUID;
  is_existing BOOLEAN := FALSE;
  user_onboarding_completed BOOLEAN;
  user_onboarding_step INTEGER;
BEGIN
  -- Try to get existing user
  SELECT id, onboarding_completed, onboarding_step 
  INTO existing_user_id, user_onboarding_completed, user_onboarding_step
  FROM users 
  WHERE telegram_id = p_telegram_id;
  
  -- If user exists, return their data
  IF existing_user_id IS NOT NULL THEN
    is_existing := TRUE;
    RETURN QUERY SELECT 
      existing_user_id, 
      FALSE, 
      user_onboarding_completed, 
      user_onboarding_step;
    RETURN;
  END IF;
  
  -- Create new user with referral tracking
  INSERT INTO users (
    telegram_id, 
    telegram_username, 
    first_name, 
    onboarding_completed, 
    onboarding_step,
    referral_source,
    referred_at
  )
  VALUES (
    p_telegram_id, 
    p_telegram_username, 
    p_first_name, 
    FALSE, 
    0,
    p_referral_code,
    CASE WHEN p_referral_code IS NOT NULL THEN now() ELSE NULL END
  )
  RETURNING id INTO existing_user_id;
  
  -- Return new user data
  RETURN QUERY SELECT 
    existing_user_id, 
    TRUE, 
    FALSE, 
    0;
END;
$$ LANGUAGE plpgsql;