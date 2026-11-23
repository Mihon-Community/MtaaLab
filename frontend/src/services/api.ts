import { getSupabaseClient } from "./supabase";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

/** Typed API fetch wrapper; it never treats an unconfirmed write as accepted. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  const { data } = (await getSupabaseClient()?.auth.getSession()) ?? {
    data: { session: null },
  };
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (data.session?.access_token)
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}
