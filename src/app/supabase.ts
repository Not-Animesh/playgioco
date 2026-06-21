// Supabase client + storage layer
// Falls back to localStorage + BroadcastChannel when env vars are missing

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string | undefined
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null

export const hasSupabase = !!supabase

// ─── ROOM STORAGE ────────────────────────────────────────────────────────────
// Store entire room state as a single JSON blob.
// Schema (run in Supabase SQL editor):
//
//   create table if not exists public.rooms (
//     room_code  text primary key,
//     data       jsonb not null default '{}',
//     created_at timestamptz not null default now(),
//     updated_at timestamptz not null default now()
//   );
//
//   alter table public.rooms enable row level security;
//   create policy "allow_all" on public.rooms for all using (true) with check (true);
//
//   -- Enable Realtime
//   alter publication supabase_realtime add table public.rooms;
//
//   -- Optional: auto-cleanup rooms older than 4 hours (run via pg_cron or Edge Function)
//   create or replace function cleanup_old_rooms() returns void language plpgsql as $$
//   begin
//     delete from public.rooms where updated_at < now() - interval '4 hours';
//   end;
//   $$;

const LS_KEY = (code: string) => `gioco_room_${code.toUpperCase()}`

export const roomDB = {
  /** Load room — Supabase first, localStorage fallback */
  async get(code: string): Promise<unknown | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from("rooms")
        .select("data")
        .eq("room_code", code.toUpperCase())
        .maybeSingle()
      if (!error && data?.data) {
        // Keep local cache warm
        localStorage.setItem(LS_KEY(code), JSON.stringify(data.data))
        return data.data
      }
    }
    try { return JSON.parse(localStorage.getItem(LS_KEY(code)) || "null") }
    catch { return null }
  },

  /** Save room — optimistic local write, then Supabase */
  set(code: string, data: unknown): void {
    // 1. Local cache — immediate
    localStorage.setItem(LS_KEY(code), JSON.stringify(data))
    // 2. Same-browser tabs via BroadcastChannel
    try { new BroadcastChannel(`gioco_${code}`).postMessage({ type: "UPDATE", room: data }) } catch {}
    // 3. Supabase — fire and forget (Realtime will propagate to other devices)
    if (supabase) {
      supabase
        .from("rooms")
        .upsert({ room_code: code.toUpperCase(), data, updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.error("[supabase] upsert error:", error.message) })
    }
  },

  /** Hard-delete room when host ends it */
  delete(code: string): void {
    localStorage.removeItem(LS_KEY(code))
    if (supabase) {
      supabase
        .from("rooms")
        .delete()
        .eq("room_code", code.toUpperCase())
        .then(({ error }) => { if (error) console.error("[supabase] delete error:", error.message) })
    }
  },

  /**
   * Subscribe to live room updates.
   * Returns an unsubscribe function.
   */
  subscribe(code: string, onUpdate: (data: unknown | null) => void): () => void {
    const cleanups: Array<() => void> = []

    if (supabase) {
      // Supabase Realtime — cross-device
      const channel = supabase
        .channel(`room-${code.toUpperCase()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rooms",
            filter: `room_code=eq.${code.toUpperCase()}`,
          },
          payload => {
            if (payload.eventType === "DELETE") {
              onUpdate(null)
            } else {
              const row = payload.new as { data?: unknown }
              if (row.data) onUpdate(row.data)
            }
          }
        )
        .subscribe()
      cleanups.push(() => supabase.removeChannel(channel))
    } else {
      // localStorage poll — same-browser fallback
      const timer = setInterval(() => {
        try {
          const raw = localStorage.getItem(LS_KEY(code))
          if (raw) onUpdate(JSON.parse(raw))
        } catch {}
      }, 600)
      cleanups.push(() => clearInterval(timer))
    }

    // BroadcastChannel — same-browser tabs (always active)
    try {
      const bc = new BroadcastChannel(`gioco_${code}`)
      bc.onmessage = e => { if (e.data?.room) onUpdate(e.data.room) }
      cleanups.push(() => bc.close())
    } catch {}

    return () => cleanups.forEach(fn => fn())
  },
}
