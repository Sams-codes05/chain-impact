import { createClient } from '@supabase/supabase-js';

const defaultSupabaseUrl = 'https://eddzshqrzoafnrsejxmh.supabase.co';
const defaultSupabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZHpzaHFyem9yc2VqeG1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NzQxNzYsImV4cCI6MjA3NTA1MDE3Nn0.vDIt8RHmo2-xBEBSWlWF43H2V08E_IHHn0EJVCW2BQc';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || defaultSupabaseUrl;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || defaultSupabaseAnonKey;

if (!process.env.REACT_APP_SUPABASE_URL || !process.env.REACT_APP_SUPABASE_ANON_KEY) {
  console.warn(
    'Supabase environment variables are not set. Falling back to default development credentials. '
      + 'For production, define REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in your environment.'
  );
}

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export default supabaseClient;