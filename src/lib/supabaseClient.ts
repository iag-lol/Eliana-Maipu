import { createClient } from "@supabase/supabase-js";

const FALLBACK_URL = "https://omvxnodsaiqtvxyrvebt.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tdnhub2RzYWlxdHZ4eXJ2ZWJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkyMzgsImV4cCI6MjA3NzU5NTIzOH0.5QMmyk1GfAU09ng1NW21WmSpZszsVMX34U5fbyrjF_0";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? FALLBACK_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? FALLBACK_ANON_KEY;

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn("Using fallback Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for production.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      "x-client-info": "negocio-eliana-maipu-dashboard"
    }
  }
});
