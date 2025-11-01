import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tcmtxvuucjttngcazgff.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjbXR4dnV1Y2p0dG5nY2F6Z2ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MjUwMDEsImV4cCI6MjA1NjMwMTAwMX0.2WcIjMUEhSM6j9kYpbsYArQocZdHx86k7wXk-NyjIs0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      "x-client-info": "negocio-eliana-maipu-dashboard"
    }
  }
});
