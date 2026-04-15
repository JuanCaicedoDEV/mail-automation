-- ================================================
-- Vision Media 1.0 - Complete Database Schema
-- ================================================

-- Create ENUM for post status
DO $$ BEGIN
    CREATE TYPE post_status AS ENUM ('PENDING', 'APPROVED', 'PUBLISHED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Brands table
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    website_url TEXT,
    logo_url TEXT,
    identity_description TEXT,
    brand_dna JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    master_prompt TEXT,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Posts table (complete with all migration columns)
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    specific_prompt TEXT,
    image_count INTEGER DEFAULT 1,
    image_urls JSONB DEFAULT '[]'::jsonb,
    caption TEXT,
    status post_status DEFAULT 'PENDING',
    type TEXT DEFAULT 'POST',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    input_image_url TEXT,
    use_as_content BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'PENDING',
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, email)
);

-- Gmail OAuth credentials table
CREATE TABLE IF NOT EXISTS gmail_credentials (
    id SERIAL PRIMARY KEY,
    user_email TEXT UNIQUE NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    token_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_campaign_id ON posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
