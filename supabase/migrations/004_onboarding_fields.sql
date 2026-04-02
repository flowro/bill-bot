-- Add onboarding fields to users table
-- Created for issue #10: Onboarding flow for new users

-- Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS 
  display_name TEXT,
  currency TEXT DEFAULT 'GBP' CHECK (currency IN ('GBP', 'USD', 'EUR')),
  trade TEXT CHECK (trade IN ('plumber', 'builder', 'electrician', 'landscaper', 'other')),
  trade_other TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0;

-- Update get_or_create_user function to handle onboarding
CREATE OR REPLACE FUNCTION get_or_create_user(
  p_telegram_id BIGINT,
  p_telegram_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL
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
  
  -- Create new user
  INSERT INTO users (telegram_id, telegram_username, first_name, onboarding_completed, onboarding_step)
  VALUES (p_telegram_id, p_telegram_username, p_first_name, FALSE, 0)
  RETURNING id INTO existing_user_id;
  
  -- Return new user data
  RETURN QUERY SELECT 
    existing_user_id, 
    TRUE, 
    FALSE, 
    0;
END;
$$ LANGUAGE plpgsql;

-- Function to update onboarding step
CREATE OR REPLACE FUNCTION update_onboarding_step(
  p_telegram_id BIGINT,
  p_step INTEGER,
  p_display_name TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_trade TEXT DEFAULT NULL,
  p_trade_other TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  user_uuid UUID;
  completed BOOLEAN := FALSE;
BEGIN
  -- Get user ID
  SELECT id INTO user_uuid FROM users WHERE telegram_id = p_telegram_id;
  
  IF user_uuid IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Mark as completed if step is final
  IF p_step >= 5 THEN
    completed := TRUE;
  END IF;
  
  -- Update user record
  UPDATE users 
  SET 
    onboarding_step = p_step,
    onboarding_completed = completed,
    display_name = COALESCE(p_display_name, display_name),
    currency = COALESCE(p_currency, currency),
    trade = COALESCE(p_trade, trade),
    trade_other = COALESCE(p_trade_other, trade_other)
  WHERE id = user_uuid;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;