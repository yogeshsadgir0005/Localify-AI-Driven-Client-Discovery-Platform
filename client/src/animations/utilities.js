/**
 * Reusable GSAP and DOM utilities for animations.
 */

/**
 * Checks if the user's OS has requested reduced motion.
 * @returns {boolean}
 */
export const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Checks if the current device has a fine pointer (like a mouse).
 * Used to disable custom cursors on touch devices.
 * @returns {boolean}
 */
export const hasFinePointer = () => {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(pointer: fine)').matches;
};
