/**
 * Format a millisecond offset as M:SS (or H:MM:SS past an hour).
 * Used for on-screen turn timestamps.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Format a millisecond value as an SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(millis, 3)}`;
}
