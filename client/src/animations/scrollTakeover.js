import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './utilities';

gsap.registerPlugin(ScrollTrigger);

/**
 * Initializes the Scroll Takeover timeline (pinning and scrubbing)
 * @param {HTMLElement} triggerElement - The DOM element to pin
 * @param {boolean} isDesktop - Conditionally alter pin length and complexity
 */
export const initScrollTakeover = (triggerElement, isDesktop = true) => {
  if (!triggerElement || prefersReducedMotion()) return;

  const pinDuration = isDesktop ? 1000 : 800; // Less scrolling required

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: triggerElement,
      start: 'top top',
      end: `+=${pinDuration}`,
      scrub: 1, 
      pin: true,
      anticipatePin: 1,
      fastScrollEnd: true
    }
  });

  // Map scale up
  tl.to('.takeover-map-container', {
    scale: isDesktop ? 5 : 3, // Smaller scale on mobile to prevent clipping
    opacity: 0.1, 
    duration: 1,
    ease: 'power1.inOut'
  })
  // Intro text fade
  .to('.takeover-intro-text', { opacity: 0, y: -50, duration: 0.3 }, 0)
  // Draw SVG
  .fromTo('.takeover-svg-path', 
    { drawSVG: "0%" },
    { drawSVG: "100%", duration: 0.5, stagger: 0.1, ease: 'power2.out' },
    0.3
  )
  // HUD Cards
  .to('.takeover-hud-card', {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.4,
    ease: 'back.out(1.5)'
  }, 0.5);

  return tl;
};
