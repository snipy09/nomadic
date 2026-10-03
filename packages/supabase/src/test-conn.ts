import { createClient } from '@supabase/supabase-js';

// Reads credentials from the environment (see .env.example); nothing is baked in.
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('[Supabase] Testing connection to:', SUPABASE_URL);
  try {
    const { data, error } = await supabase.from('jobs').select('*').limit(1);
    if (error) {
      console.log('[Supabase API Response] Note:', error.message);
    } else {
      console.log('[Supabase API Response] Connected successfully! Records found:', data?.length || 0);
    }
  } catch (err: any) {
    console.log('[Supabase Error]:', err.message);
  }
}

main();
