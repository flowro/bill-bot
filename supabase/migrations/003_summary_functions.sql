-- Additional functions for summary features
-- Created for issue #16: Weekly/monthly summary reports

-- Function to get active users (users with receipts in last N days)
CREATE OR REPLACE FUNCTION get_active_users_last_30_days()
RETURNS TABLE (
  telegram_id BIGINT,
  first_name TEXT,
  last_receipt_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    u.telegram_id,
    u.first_name,
    MAX(r.created_at) as last_receipt_date
  FROM users u
  INNER JOIN receipts r ON r.user_id = u.id
  WHERE r.created_at >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY u.telegram_id, u.first_name
  ORDER BY last_receipt_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get spending comparison between periods
CREATE OR REPLACE FUNCTION get_spending_comparison(
  p_telegram_id BIGINT,
  p_current_start_date DATE,
  p_current_end_date DATE,
  p_previous_start_date DATE,
  p_previous_end_date DATE
) RETURNS TABLE (
  current_total DECIMAL(10,2),
  previous_total DECIMAL(10,2),
  difference DECIMAL(10,2),
  percentage_change DECIMAL(5,2),
  current_receipts INTEGER,
  previous_receipts INTEGER
) AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get user ID
  SELECT id INTO user_uuid FROM users WHERE telegram_id = p_telegram_id;
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  RETURN QUERY
  SELECT 
    COALESCE(current_period.total, 0) as current_total,
    COALESCE(previous_period.total, 0) as previous_total,
    COALESCE(current_period.total, 0) - COALESCE(previous_period.total, 0) as difference,
    CASE 
      WHEN COALESCE(previous_period.total, 0) > 0 THEN
        ((COALESCE(current_period.total, 0) - COALESCE(previous_period.total, 0)) / previous_period.total * 100)::DECIMAL(5,2)
      ELSE 
        NULL
    END as percentage_change,
    COALESCE(current_period.receipt_count, 0)::INTEGER as current_receipts,
    COALESCE(previous_period.receipt_count, 0)::INTEGER as previous_receipts
  FROM (
    SELECT 
      SUM(amount) as total,
      COUNT(*) as receipt_count
    FROM receipts 
    WHERE user_id = user_uuid 
      AND receipt_date BETWEEN p_current_start_date AND p_current_end_date
  ) current_period
  CROSS JOIN (
    SELECT 
      SUM(amount) as total,
      COUNT(*) as receipt_count
    FROM receipts 
    WHERE user_id = user_uuid 
      AND receipt_date BETWEEN p_previous_start_date AND p_previous_end_date
  ) previous_period;
END;
$$ LANGUAGE plpgsql;