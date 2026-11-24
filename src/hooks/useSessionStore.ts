import { useCallback, useEffect, useRef, useState } from "react";
import {
  type SessionData,
  type SessionSummary,
  serializeSession,
  parseSession,
  parseSessionSummary,
} from "@/shared/session";
import { SESSION_AUTOSAVE_MS } from "../lib/constants";

/**
 * Client side of the session store: the recordings library plus the debounced
 * autosave that makes a refresh survivable.
 *
 * Saving is deliberately forgiving — a failed write keeps the payload for the next
 * attempt and reports itself, but never interrupts a recording. The transcript in
 * memory stays authoritative until a write succeeds.
 */
export function useSessionStore() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  // Latest unsaved session, and the pending debounce timer.
  const pendingRef = useRef<SessionData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(list.map(parseSessionSummary));
    } catch (e: any) {
      setListError(e?.message ?? "Unknown error");
    } finally {
      setListLoading(false);
    }
  }, []);

  const save = useCallback(async (session: SessionData) => {
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: serializeSession(session) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
  }, []);

  /** Write whatever is pending right now. */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const session = pendingRef.current;
    if (!session) return;
    pendingRef.current = null;
    try {
      await save(session);
      setSaveFailed(false);
    } catch (e) {
      console.error("Session autosave failed:", e);
      // Keep it queued so the next change (or flush) retries.
      pendingRef.current = session;
      setSaveFailed(true);
    }
  }, [save]);

  /** Queue a save, collapsing rapid changes into one write. */
  const scheduleSave = useCallback((session: SessionData) => {
    pendingRef.current = session;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, SESSION_AUTOSAVE_MS);
  }, [flush]);

  const load = useCallback(async (id: string): Promise<SessionData> => {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return parseSession(data.session);
  }, []);

  const remove = useCallback(async (id: string, withNote: boolean) => {
    const res = await fetch(`/api/sessions/${id}?withNote=${withNote ? "true" : "false"}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    // Don't leave a deleted recording on screen in the library.
    if (pendingRef.current?.id === id) pendingRef.current = null;
    const result = await res.json();
    await refresh();
    return result as { deleted: boolean; noteDeleted?: string; noteError?: string };
  }, [refresh]);

  // A normal fetch during unload is routinely cancelled, so hand the last state to
  // sendBeacon instead. `pagehide` fires for tab close, reload and navigation.
  useEffect(() => {
    const onPageHide = () => {
      const session = pendingRef.current;
      if (!session) return;
      const body = new Blob(
        [JSON.stringify({ session: serializeSession(session) })],
        { type: "application/json" },
      );
      navigator.sendBeacon(`/api/sessions/${session.id}`, body);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  return {
    sessions, listLoading, listError, saveFailed,
    refresh, load, remove, scheduleSave, flush,
  };
}
