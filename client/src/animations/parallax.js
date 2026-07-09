import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './utilities';

gsap.registerPlugin(ScrollTrigger);

/**
 * Initializes parallax movement for background elements
 * @param {HTMLElement} container - The container that triggers the parallax
 * @param {boolean} isDesktop - Conditionally disable or reduce parallax on mobile
 */
export const initParallax = (container, isDesktop = true) => {
  if (prefersReducedMotion() || !isDesktop) return; // Disable on mobile to save performance

  const bgs = gsap.utils.toArray('.parallax-bg');
  
  bgs.forEach((bg, i) => {
    gsap.to(bg, {
      y: () => window.innerHeight * (i % 2 === 0 ? 0.2 : -0.2),
      ease: 'none',
      scrollTrigger: {
        trigger: container,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true, // Recalculate on resize
      }
    });
  });
};

/**
 * Initializes horizontal scrolling for oversized parallax text
 * @param {HTMLElement} container - The container 
 */
export const initTextParallax = (container) => {
  if (prefersReducedMotion()) return;

  const texts = gsap.utils.toArray('.parallax-text');
  
  texts.forEach((text) => {
    // The text scrolls to the left as you scroll down
    gsap.to(text, {
      xPercent: -30,
      ease: 'none',
      scrollTrigger: {
        trigger: text.closest('section') || container,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 0.5
      }
    });
  });
};
