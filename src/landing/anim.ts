export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const ease = (t: number): number => t * t * (3 - 2 * t);

/** 0 -> 1 between a..b, hold to c, 1 -> 0 between c..d (eased). */
export function win(p: number, a: number, b: number, c: number, d: number): number {
  if (p < a || p > d) return 0;
  if (p < b) return ease((p - a) / (b - a));
  if (p <= c) return 1;
  return ease(1 - (p - c) / (d - c));
}

/** Fade + blur + slide an element according to visibility v (0..1). */
export function show(el: HTMLElement | null, v: number, dy: number): void {
  if (!el) return;
  el.style.opacity = String(v);
  el.style.filter = v < 0.99 ? `blur(${(1 - v) * 14}px)` : 'none';
  el.style.transform = `translateY(${(1 - v) * dy}px)`;
}
