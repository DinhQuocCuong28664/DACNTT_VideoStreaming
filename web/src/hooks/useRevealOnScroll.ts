import { useEffect, type RefObject } from 'react';

/**
 * Adds `is-visible` once to every `[data-reveal]` or `[data-reveal-stagger]` element inside the
 * container when it scrolls into view; index.css does the animation. Without
 * IntersectionObserver everything shows at once, so content is never stuck invisible.
 */
export function useRevealOnScroll(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const targets = root.querySelectorAll('[data-reveal], [data-reveal-stagger]');
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [containerRef]);
}
