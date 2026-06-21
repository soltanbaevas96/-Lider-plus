import { createClient } from "@supabase/supabase-js";

// ── ВПИШИТЕ СВОИ ЗНАЧЕНИЯ из Supabase → Project Settings → API ──────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "ВСТАВЬТЕ_PROJECT_URL";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || "ВСТАВЬТЕ_ANON_PUBLIC_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
export const supaReady = !SUPABASE_URL.includes("ВСТАВЬТЕ") && !SUPABASE_ANON.includes("ВСТАВЬТЕ");
