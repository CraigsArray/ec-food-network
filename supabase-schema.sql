-- Supabase Schema Setup

-- 1. Create Posts table
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  category text,
  address text,
  city text,
  zip text,
  latitude double precision,
  longitude double precision,
  -- Organization fields (stored directly on post, no separate orgs table)
  author_name text,
  organization_type text,
  phone text,
  email text,
  logo_url text,
  website_url text,
  -- Scheduling (legacy direct fields; prefer post_occurrences for new entries)
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  tags text[],
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true
);

-- 2. Set up Storage
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true)
  on conflict (id) do nothing;

-- Enable Row Level Security (RLS)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone."
ON posts FOR SELECT
USING ( true );

CREATE POLICY "Enable insert for everyone"
ON posts FOR INSERT
WITH CHECK (true);

-- Allow public access to the bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'post-images' );

CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'post-images' );

-- 3. Create Post Occurrences table
CREATE TABLE post_occurrences (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone,
  expires_at timestamp with time zone,
  is_cancelled boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE post_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone."
ON post_occurrences FOR SELECT
USING ( true );

CREATE POLICY "Enable insert for everyone"
ON post_occurrences FOR INSERT
WITH CHECK (true);

-- ============================================================
-- Migration: run these in the Supabase SQL Editor if the posts
-- table already exists from an earlier schema version.
-- ============================================================
-- Drop organizations FK and add flat org columns to posts:
-- ALTER TABLE posts DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_name text;
-- ALTER TABLE posts ADD COLUMN IF NOT EXISTS organization_type text;
-- ALTER TABLE posts ADD COLUMN IF NOT EXISTS phone text;
-- ALTER TABLE posts ADD COLUMN IF NOT EXISTS email text;
-- ALTER TABLE posts ADD COLUMN IF NOT EXISTS logo_url text;
-- Rename image_url → website_url if coming from the original schema:
-- ALTER TABLE posts RENAME COLUMN image_url TO website_url;
