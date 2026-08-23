// Pointer-driven 3D tilt + cursor spotlight. Sets CSS custom properties that
// index.css consumes (.tilt-card), so the transform stays in CSS-land and
// respects the global reduced-motion rules. Skipped entirely on touch-only or
// reduced-motion devices.

import { useEffect, useRef } from "react";

export function useTilt<T extends HTMLElement>(maxDeg = 7) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frameId = 0;
    let pendingEvent: PointerEvent | null = null;

    const apply = () => {
      frameId = 0;
      const event = pendingEvent;
      if (!event) return;
      const bounds = element.getBoundingClientRect();
      const px = (event.clientX - bounds.left) / bounds.width;
      const py = (event.clientY - bounds.top) / bounds.height;
      element.style.setProperty("--tilt-x", `${(0.5 - py) * maxDeg}deg`);
      element.style.setProperty("--tilt-y", `${(px - 0.5) * maxDeg}deg`);
      element.style.setProperty("--mx", `${px * 100}%`);
      element.style.setProperty("--my", `${py * 100}%`);
    };

    const onPointerMove = (event: PointerEvent) => {
      pendingEvent = event;
      if (!frameId) frameId = requestAnimationFrame(apply);
    };
    const onPointerLeave = () => {
      pendingEvent = null;
      if (frameId) { cancelAnimationFrame(frameId); frameId = 0; }
      element.style.setProperty("--tilt-x", "0deg");
      element.style.setProperty("--tilt-y", "0deg");
    };

    element.addEventListener("pointermove", onPointerMove, { passive: true });
    element.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return () => {
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerleave", onPointerLeave);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [maxDeg]);

  return ref;
}
