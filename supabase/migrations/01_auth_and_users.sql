ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE public.profiles (
      id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
      email TEXT NOT NULL,
      username TEXT,
      fullName TEXT,
      pfpUrl TEXT,
      google_verified BOOLEAN DEFAULT false,
      google_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE public.modules (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      file_url TEXT,
      file_name TEXT,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      uploaded_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE public.save_modules (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      module_id UUID REFERENCES public.modules(id) ON DELETE CASCADE NOT NULL,
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, module_id)
  );

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.save_modules ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Users can view own profile" ON public.profiles
      FOR SELECT USING (auth.uid() = id);

  CREATE POLICY "Users can update own profile" ON public.profiles
      FOR UPDATE USING (auth.uid() = id);

  CREATE POLICY "Users can insert own profile" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id);

  CREATE POLICY "Allow service role to manage profiles" ON public.profiles
      FOR ALL USING (auth.role() = 'service_role');

  CREATE POLICY "Users can view all modules" ON public.modules
      FOR SELECT USING (true);

  CREATE POLICY "Users can create own modules" ON public.modules
      FOR INSERT WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update own modules" ON public.modules
      FOR UPDATE USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete own modules" ON public.modules
      FOR DELETE USING (auth.uid() = user_id);

  CREATE POLICY "Allow service role to manage modules" ON public.modules
      FOR ALL USING (auth.role() = 'service_role');

  CREATE POLICY "Users can view own saved modules" ON public.save_modules
      FOR SELECT USING (auth.uid() = user_id);

  CREATE POLICY "Users can save modules" ON public.save_modules
      FOR INSERT WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can unsave own modules" ON public.save_modules
      FOR DELETE USING (auth.uid() = user_id);

  CREATE POLICY "Allow service role to manage save_modules" ON public.save_modules
      FOR ALL USING (auth.role() = 'service_role');

  CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER handle_updated_at_profiles
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_updated_at();

  CREATE TRIGGER handle_updated_at_modules
      BEFORE UPDATE ON public.modules
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_updated_at();

  CREATE OR REPLACE VIEW public.modules_with_users AS
  SELECT
      m.*,
      p.username,
      p.fullName,
      p.pfpUrl
  FROM public.modules m
  LEFT JOIN public.profiles p ON m.user_id = p.id;

  CREATE OR REPLACE VIEW public.saved_modules_detailed AS
  SELECT
      sm.*,
      m.title,
      m.description,
      m.file_url,
      m.file_name,
      m.uploaded_by,
      m.created_at as module_created_at,
      p.username,
      p.fullName,
      p.pfpUrl
  FROM public.save_modules sm
  JOIN public.modules m ON sm.module_id = m.id
  LEFT JOIN public.profiles p ON m.user_id = p.id;

  CREATE INDEX idx_modules_user_id ON public.modules(user_id);
  CREATE INDEX idx_modules_created_at ON public.modules(created_at DESC);
  CREATE INDEX idx_save_modules_user_id ON public.save_modules(user_id);
  CREATE INDEX idx_save_modules_module_id ON public.save_modules(module_id);
  CREATE INDEX idx_profiles_email ON public.profiles(email);

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
      'module-files',
      'module-files',
      true,
      10485760,
      ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
  )
  ON CONFLICT (id) DO NOTHING;

  CREATE POLICY "Anyone can view module files" ON storage.objects
      FOR SELECT USING (bucket_id = 'module-files');

  CREATE POLICY "Authenticated users can upload module files" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'module-files' AND auth.role() = 'authenticated');

  CREATE POLICY "Users can update own module files" ON storage.objects
      FOR UPDATE USING (bucket_id = 'module-files' AND auth.uid()::text = (storage.foldername(name))[1]);

  CREATE POLICY "Users can delete own module files" ON storage.objects
      FOR DELETE USING (bucket_id = 'module-files' AND auth.uid()::text = (storage.foldername(name))[1]);

  SELECT
      'Tables Created:' as status,
      table_name,
      table_type
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'modules', 'save_modules')
  ORDER BY table_name;

  SELECT
      'Storage Bucket:' as status,
      id,
      name,
      public
  FROM storage.buckets
  WHERE id = 'module-files';

  SELECT
      'Final Setup Complete!' as message,
      COUNT(*) as tables_created
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'modules', 'save_modules');

  DROP TRIGGER IF EXISTS handle_updated_at ON public.profiles;
  CREATE TRIGGER handle_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_updated_at();

      SELECT 
    trigger_name,
    event_manipulation,
    trigger_schema,
    trigger_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name ILIKE '%profile%'
   OR trigger_name ILIKE '%auth%'
   OR trigger_name ILIKE '%user%'
ORDER BY trigger_name;

SELECT 
    routine_name,
    routine_type,
    data_type AS return_type
FROM information_schema.routines
WHERE routine_name ILIKE '%profile%'
   OR routine_name ILIKE '%new_user%'
   OR routine_name ILIKE '%auth%'
ORDER BY routine_name;

ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

-- Create index for better performance
CREATE INDEX idx_users_role ON users(role);

-- Update existing users to have 'user' role (optional, as default is set)
UPDATE users SET role = 'user' WHERE role IS NULL;

UPDATE users SET role = 'admin' WHERE user_id = 'user-id-here';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

UPDATE users SET role = 'admin' WHERE user_id = '85e100ff-844c-4379-a56a-65b285f468b9';

DROP VIEW IF EXISTS public.modules_with_users CASCADE;
DROP VIEW IF EXISTS public.saved_modules_detailed CASCADE;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_modules_updated_at ON public.modules;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view modules" ON public.modules;
DROP POLICY IF EXISTS "Users can insert own modules" ON public.modules;
DROP POLICY IF EXISTS "Users can update own modules" ON public.modules;
DROP POLICY IF EXISTS "Users can delete own modules" ON public.modules;
DROP POLICY IF EXISTS "Service role full access to modules" ON public.modules;
DROP POLICY IF EXISTS "Users can view own saved modules" ON public.save_modules;
DROP POLICY IF EXISTS "Users can save modules" ON public.save_modules;
DROP POLICY IF EXISTS "Users can unsave own modules" ON public.save_modules;
DROP POLICY IF EXISTS "Service role full access to save_modules" ON public.save_modules;
DROP INDEX IF EXISTS idx_profiles_email;
DROP INDEX IF EXISTS idx_modules_user_id;
DROP INDEX IF EXISTS idx_modules_created_at;
DROP INDEX IF EXISTS idx_save_modules_user_id;
DROP INDEX IF EXISTS idx_save_modules_module_id;
DROP INDEX IF EXISTS idx_save_modules_user_module;
DROP TABLE IF EXISTS public.save_modules CASCADE;
DROP TABLE IF EXISTS public.modules CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DELETE FROM storage.objects WHERE bucket_id = 'module-files';
DELETE FROM storage.buckets WHERE id = 'module-files';