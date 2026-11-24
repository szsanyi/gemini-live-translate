import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chat-style "stick to bottom" scrolling for a scrollable element.
 *
 * New content follows the view only while the user is parked at the bottom. Scroll
 * up — to re-read something, fix a word or attach a note — and the view stays put
 * however much text keeps arriving; the caller shows a "jump to current" button
 * while `atBottom` is false.
 *
 * The follow-scroll is deliberately instant rather than smooth: a smooth animation
 * is still running when the next chunk arrives, so scrolling up during live speech
 * would fight an animation that keeps dragging the view back down. The button's own
 * scroll is smooth, since nothing competes with it.
 */

/** Distance from the bottom (px) still counted as "at the bottom". */
const STICK_THRESHOLD_PX = 80;

export function useStickToBottom<T extends HTMLElement>(deps: unknown[]) {
  const containerRef = useRef<T | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  // The follow-effect reads this synchronously; state alone would be a render behind.
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const next = distance <= STICK_THRESHOLD_PX;
      // Only flip on a real change, so a scroll gesture doesn't re-render per event.
      if (next !== atBottomRef.current) {
        atBottomRef.current = next;
        setAtBottom(next);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, atBottom, scrollToBottom };
}
