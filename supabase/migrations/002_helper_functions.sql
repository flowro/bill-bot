-- Helper functions for Bill Bot MVP1
-- Created for issue #13: Supabase database schema + storage

-- Function to create or get user
CREATE OR REPLACE FUNCTION get_or_create_user(
  p_telegram_id BIGINT,
  p_telegram_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Try to get existing user
  SELECT id INTO user_uuid 
  FROM users 
  WHERE telegram_id = p_telegram_id;
  
  -- If not found, create new user
  IF user_uuid IS NULL THEN
    INSERT INTO users (telegram_id, telegram_username, first_name)
    VALUES (p_telegram_id, p_telegram_username, p_first_name)
    RETURNING id INTO user_uuid;
  END IF;
  
  RETURN user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to get user spending summary
CREATE OR REPLACE FUNCTION get_spending_summary(
  p_telegram_id BIGINT,
  p_start_date DATE DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  p_end_date DATE DEFAULT (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::DATE
) RETURNS TABLE (
  total_amount DECIMAL(10,2),
  category_breakdown JSONB,
  job_breakdown JSONB,
  receipt_count INTEGER
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
    COALESCE(SUM(r.amount), 0) as total_amount,
    COALESCE(
      jsonb_object_agg(
        COALESCE(r.category, 'uncategorized'), 
        category_sum.amount
      ) FILTER (WHERE category_sum.amount > 0),
      '{}'::jsonb
    ) as category_breakdown,
    COALESCE(
      jsonb_object_agg(
        COALESCE(j.name, 'No Job'), 
        job_sum.amount
      ) FILTER (WHERE job_sum.amount > 0),
      '{}'::jsonb
    ) as job_breakdown,
    COUNT(r.id)::INTEGER as receipt_count
  FROM receipts r
  LEFT JOIN jobs j ON r.job_id = j.id
  LEFT JOIN (
    SELECT 
      category,
      SUM(amount) as amount
    FROM receipts 
    WHERE user_id = user_uuid 
      AND receipt_date BETWEEN p_start_date AND p_end_date
    GROUP BY category
  ) category_sum ON category_sum.category = r.category
  LEFT JOIN (
    SELECT 
      r2.job_id,
      SUM(r2.amount) as amount
    FROM receipts r2
    WHERE r2.user_id = user_uuid 
      AND r2.receipt_date BETWEEN p_start_date AND p_end_date
    GROUP BY r2.job_id
  ) job_sum ON job_sum.job_id = r.job_id
  WHERE r.user_id = user_uuid 
    AND r.receipt_date BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to create job
CREATE OR REPLACE FUNCTION create_job(
  p_telegram_id BIGINT,
  p_job_name TEXT,
  p_client TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  user_uuid UUID;
  job_uuid UUID;
BEGIN
  -- Get user ID
  SELECT id INTO user_uuid FROM users WHERE telegram_id = p_telegram_id;
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Create job
  INSERT INTO jobs (user_id, name, client)
  VALUES (user_uuid, p_job_name, p_client)
  RETURNING id INTO job_uuid;
  
  RETURN job_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to search receipts by text
CREATE OR REPLACE FUNCTION search_receipts(
  p_telegram_id BIGINT,
  p_search_text TEXT,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  id UUID,
  amount DECIMAL(10,2),
  vendor TEXT,
  receipt_date DATE,
  category TEXT,
  description TEXT,
  job_name TEXT
) AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get user ID
  SELECT users.id INTO user_uuid FROM users WHERE telegram_id = p_telegram_id;
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  RETURN QUERY
  SELECT 
    r.id,
    r.amount,
    r.vendor,
    r.receipt_date,
    r.category,
    r.description,
    j.name as job_name
  FROM receipts r
  LEFT JOIN jobs j ON r.job_id = j.id
  WHERE r.user_id = user_uuid
    AND (
      r.vendor ILIKE '%' || p_search_text || '%' OR
      r.description ILIKE '%' || p_search_text || '%' OR
      r.raw_ocr_text ILIKE '%' || p_search_text || '%' OR
      j.name ILIKE '%' || p_search_text || '%' OR
      j.client ILIKE '%' || p_search_text || '%'
    )
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get receipts for export
CREATE OR REPLACE FUNCTION get_receipts_for_export(
  p_telegram_id BIGINT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  amount DECIMAL(10,2),
  vendor TEXT,
  receipt_date DATE,
  category TEXT,
  description TEXT,
  job_name TEXT,
  client TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get user ID
  SELECT users.id INTO user_uuid FROM users WHERE telegram_id = p_telegram_id;
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Default to current month if no dates specified
  IF p_start_date IS NULL THEN
    p_start_date := date_trunc('month', CURRENT_DATE)::DATE;
  END IF;
  
  IF p_end_date IS NULL THEN
    p_end_date := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::DATE;
  END IF;
  
  RETURN QUERY
  SELECT 
    r.id,
    r.amount,
    r.vendor,
    r.receipt_date,
    r.category,
    r.description,
    j.name as job_name,
    j.client,
    r.image_url,
    r.created_at
  FROM receipts r
  LEFT JOIN jobs j ON r.job_id = j.id
  WHERE r.user_id = user_uuid
    AND r.receipt_date BETWEEN p_start_date AND p_end_date
  ORDER BY r.receipt_date DESC, r.created_at DESC;
END;
$$ LANGUAGE plpgsql;