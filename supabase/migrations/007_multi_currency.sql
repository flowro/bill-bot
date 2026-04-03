-- Multi-currency support for bill-bot
-- Created for issue #8: Multi-currency support (GBP, USD, EUR)

-- Add currency field to users (default currency preference)
ALTER TABLE users ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'GBP', 'EUR'));

-- Add currency field to receipts (detected currency from receipt)
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'GBP', 'EUR'));

-- Update existing data to have default currency
UPDATE users SET currency = 'USD' WHERE currency IS NULL;
UPDATE receipts SET currency = 'USD' WHERE currency IS NULL;

-- Create currency conversion rate table (for future exchange rate support)
CREATE TABLE IF NOT EXISTS currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL CHECK (from_currency IN ('USD', 'GBP', 'EUR')),
  to_currency TEXT NOT NULL CHECK (to_currency IN ('USD', 'GBP', 'EUR')),
  rate DECIMAL(10,6) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure one rate per currency pair per date
  UNIQUE(from_currency, to_currency, date)
);

-- Insert default exchange rates (1.0 for same currency)
INSERT INTO currency_rates (from_currency, to_currency, rate, date) 
VALUES 
  ('USD', 'USD', 1.0, CURRENT_DATE),
  ('GBP', 'GBP', 1.0, CURRENT_DATE), 
  ('EUR', 'EUR', 1.0, CURRENT_DATE)
ON CONFLICT (from_currency, to_currency, date) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_currency ON users(currency);
CREATE INDEX IF NOT EXISTS idx_receipts_currency ON receipts(currency);
CREATE INDEX IF NOT EXISTS idx_currency_rates_lookup ON currency_rates(from_currency, to_currency, date);

-- Function to get currency symbol
CREATE OR REPLACE FUNCTION get_currency_symbol(curr TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE curr
    WHEN 'USD' THEN RETURN '$';
    WHEN 'GBP' THEN RETURN '£';
    WHEN 'EUR' THEN RETURN '€';
    ELSE RETURN '$';
  END CASE;
END;
$$;

-- Function to format amount with currency
CREATE OR REPLACE FUNCTION format_currency_amount(amount DECIMAL, curr TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE  
AS $$
DECLARE
  symbol TEXT;
BEGIN
  symbol := get_currency_symbol(curr);
  
  -- Different formatting for different currencies
  CASE curr
    WHEN 'USD' THEN RETURN symbol || amount::TEXT;
    WHEN 'GBP' THEN RETURN symbol || amount::TEXT; 
    WHEN 'EUR' THEN RETURN amount::TEXT || symbol;
    ELSE RETURN symbol || amount::TEXT;
  END CASE;
END;
$$;

-- Update summary functions to be currency-aware
CREATE OR REPLACE FUNCTION get_monthly_summary_by_currency(user_telegram_id BIGINT, target_month DATE)
RETURNS TABLE(
  category TEXT,
  currency TEXT,
  total_amount DECIMAL,
  receipt_count BIGINT,
  formatted_amount TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Get user
  SELECT * INTO user_record FROM users WHERE telegram_id = user_telegram_id;
  
  IF user_record IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    r.category,
    r.currency,
    SUM(r.amount) as total_amount,
    COUNT(*) as receipt_count,
    format_currency_amount(SUM(r.amount), r.currency) as formatted_amount
  FROM receipts r
  WHERE r.user_id = user_record.id 
    AND date_trunc('month', r.receipt_date) = date_trunc('month', target_month)
    AND r.amount IS NOT NULL
  GROUP BY r.category, r.currency
  ORDER BY r.currency, total_amount DESC;
END;
$$;