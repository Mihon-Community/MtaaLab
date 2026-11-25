import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Lazily create Supabase client so missing local/CI env never breaks module import. */
export function getSupabaseClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const isPlaceholderUrl =
    !url ||
    url.includes("YOUR_PROJECT") ||
    url === "https://example.supabase.co";
  const isPlaceholderKey =
    !key || key === "replace_me" || key === "ci-placeholder-public-key";

  if (isPlaceholderUrl || isPlaceholderKey) return null;
  client ??= createClient(url, key);
  return client;
}
