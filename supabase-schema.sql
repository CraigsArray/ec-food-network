-- Supabase Schema Setup

-- 1. Create Organizations table
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  website text,
  phone text,
  email text,
  logo_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Posts table
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES organizations(id),
  title text NOT NULL,
  description text,
  address text,
  city text,
  zip text,
  latitude double precision,
  longitude double precision,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  category text,
  tags text[],
  image_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true
);

-- 3. Set up Storage
-- You can run this part in the Supabase SQL Editor or set it up manually via the dashboard:
-- Create a new public storage bucket called "post-images"
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true);

-- Enable Row Level Security (RLS) on posts and organizations
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Create policies for public reading (Since it's a public resource feed)
CREATE POLICY "Public profiles are viewable by everyone." 
ON posts FOR SELECT 
USING ( true );

CREATE POLICY "Public profiles are viewable by everyone." 
ON organizations FOR SELECT 
USING ( true );

-- For MVP admin writes, we can allow authenticated users to insert/update, 
-- or simply disable RLS temporarily while testing.
-- To allow authenticated inserts:
CREATE POLICY "Enable insert for authenticated users only"
ON posts FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow public access to the bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'post-images' );

CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'post-images' );

-- 4. Create Post Occurrences table
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

CREATE POLICY "Enable insert for authenticated users only"
ON post_occurrences FOR INSERT
TO authenticated
WITH CHECK (true);
