import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Supabase client used exclusively for Realtime subscriptions.
// All DB queries go through Prisma.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
