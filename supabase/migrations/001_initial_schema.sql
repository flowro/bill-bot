-- Bill Bot MVP1 Database Schema
-- Created for issue #13: Supabase database schema + storage

-- Enable RLS
ALTER DATABASE postgres SET "app.settings.jwt_secret" TO 'your-jwt-secret';

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  first_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Jobs/Projects table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Receipts table
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  image_url TEXT, -- Supabase Storage URL
  amount DECIMAL(10,2),
  vendor TEXT,
  receipt_date DATE,
  category TEXT CHECK (category IN ('materials', 'fuel', 'tools', 'food', 'labor', 'vehicle', 'office', 'other')),
  description TEXT,
  raw_ocr_text TEXT, -- full Claude response for debugging
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_receipts_user_id ON receipts(user_id);
CREATE INDEX idx_receipts_job_id ON receipts(job_id);
CREATE INDEX idx_receipts_created_at ON receipts(created_at);
CREATE INDEX idx_receipts_category ON receipts(category);
CREATE INDEX idx_jobs_user_id ON jobs(user_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid()::text = telegram_id::text);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid()::text = telegram_id::text);

-- Jobs: users can only see/manage their own jobs
CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT USING (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

CREATE POLICY "Users can insert own jobs" ON jobs
  FOR INSERT WITH CHECK (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE USING (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

CREATE POLICY "Users can delete own jobs" ON jobs
  FOR DELETE USING (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

-- Receipts: users can only see/manage their own receipts
CREATE POLICY "Users can view own receipts" ON receipts
  FOR SELECT USING (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

CREATE POLICY "Users can insert own receipts" ON receipts
  FOR INSERT WITH CHECK (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

CREATE POLICY "Users can update own receipts" ON receipts
  FOR UPDATE USING (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

CREATE POLICY "Users can delete own receipts" ON receipts
  FOR DELETE USING (user_id IN (
    SELECT id FROM users WHERE telegram_id::text = auth.uid()::text
  ));

-- Service role bypass (for bot backend)
CREATE POLICY "Service role full access to users" ON users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to jobs" ON jobs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to receipts" ON receipts
  FOR ALL USING (auth.role() = 'service_role');

-- Create storage bucket for receipt images
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

-- Storage RLS policy
CREATE POLICY "Users can upload receipts" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'receipts' AND auth.role() = 'service_role');

CREATE POLICY "Users can view own receipts" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipts' AND auth.role() = 'service_role');

CREATE POLICY "Users can update own receipts" ON storage.objects
  FOR UPDATE USING (bucket_id = 'receipts' AND auth.role() = 'service_role');

CREATE POLICY "Users can delete own receipts" ON storage.objects
  FOR DELETE USING (bucket_id = 'receipts' AND auth.role() = 'service_role');