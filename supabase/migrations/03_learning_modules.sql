CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT,
    "fullName" TEXT,
    "pfpUrl" TEXT,
    google_verified BOOLEAN DEFAULT FALSE,
    google_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.modules (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    uploaded_by TEXT NOT NULL,
    file_url TEXT,
    file_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.save_modules (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    module_id UUID REFERENCES public.modules(id) ON DELETE CASCADE NOT NULL,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, module_id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.save_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role full access to profiles" ON public.profiles;
CREATE POLICY "Service role full access to profiles" ON public.profiles
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Anyone can view modules" ON public.modules;
CREATE POLICY "Anyone can view modules" ON public.modules
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own modules" ON public.modules;
CREATE POLICY "Users can insert own modules" ON public.modules
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own modules" ON public.modules;
CREATE POLICY "Users can update own modules" ON public.modules
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own modules" ON public.modules;
CREATE POLICY "Users can delete own modules" ON public.modules
    FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to modules" ON public.modules;
CREATE POLICY "Service role full access to modules" ON public.modules
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Users can view own saved modules" ON public.save_modules;
CREATE POLICY "Users can view own saved modules" ON public.save_modules
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can save modules" ON public.save_modules;
CREATE POLICY "Users can save modules" ON public.save_modules
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unsave own modules" ON public.save_modules;
CREATE POLICY "Users can unsave own modules" ON public.save_modules
    FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to save_modules" ON public.save_modules;
CREATE POLICY "Service role full access to save_modules" ON public.save_modules
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_modules_user_id ON public.modules(user_id);
CREATE INDEX IF NOT EXISTS idx_modules_created_at ON public.modules(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_save_modules_user_id ON public.save_modules(user_id);
CREATE INDEX IF NOT EXISTS idx_save_modules_module_id ON public.save_modules(module_id);
CREATE INDEX IF NOT EXISTS idx_save_modules_user_module ON public.save_modules(user_id, module_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_modules_updated_at ON public.modules;
CREATE TRIGGER update_modules_updated_at 
    BEFORE UPDATE ON public.modules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'module-files',
    'module-files',
    true,
    10485760,
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects 
    FOR SELECT USING (bucket_id = 'module-files');

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload" ON storage.objects 
    FOR INSERT WITH CHECK (
        bucket_id = 'module-files' 
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
CREATE POLICY "Users can update own files" ON storage.objects 
    FOR UPDATE USING (
        bucket_id = 'module-files' 
        AND auth.uid() = ((storage.foldername(name))[1])::uuid
    );

DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
CREATE POLICY "Users can delete own files" ON storage.objects 
    FOR DELETE USING (
        bucket_id = 'module-files' 
        AND auth.uid() = ((storage.foldername(name))[1])::uuid
    );

CREATE OR REPLACE VIEW public.modules_with_users AS
SELECT 
    m.*,
    p.username,
    p."fullName" as uploader_full_name,
    p."pfpUrl" as uploader_avatar
FROM public.modules m
LEFT JOIN public.profiles p ON m.user_id = p.id;

CREATE OR REPLACE VIEW public.saved_modules_detailed AS
SELECT 
    sm.id as save_id,
    sm.user_id,
    sm.saved_at,
    m.id as module_id,
    m.title,
    m.description,
    m.user_id as module_owner_id,
    m.uploaded_by,
    m.file_url,
    m.file_name,
    m.created_at,
    m.updated_at,
    p.username as uploader_username,
    p."fullName" as uploader_full_name
FROM public.save_modules sm
JOIN public.modules m ON sm.module_id = m.id
LEFT JOIN public.profiles p ON m.user_id = p.id;

-- Enable RLS
ALTER TABLE save_modules ENABLE ROW LEVEL SECURITY;

-- Insert: only save if user_id matches Firebase user
CREATE POLICY "Save module"
  ON save_modules
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::uuid);

-- Select: only see your own saves
CREATE POLICY "View saved modules"
  ON save_modules
  FOR SELECT
  USING (user_id = auth.uid()::uuid);

-- Delete: only unsave your own
CREATE POLICY "Unsave module"
  ON save_modules
  FOR DELETE
  USING (user_id = auth.uid()::uuid);
