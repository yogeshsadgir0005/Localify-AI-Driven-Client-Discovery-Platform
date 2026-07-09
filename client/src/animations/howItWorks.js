import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './utilities';

gsap.registerPlugin(ScrollTrigger);

/**
 * Initializes the Horizontal Scroll for the "How It Works" section
 * @param {HTMLElement} section - The outer section to pin
 * @param {HTMLElement} container - The inner container to translate horizontally
 * @param {boolean} isDesktop
 */
export const initHowItWorks = (section, container, isDesktop = true) => {
  if (!section || !container || prefersReducedMotion() || !isDesktop) return;

  const cards = gsap.utils.toArray(container.querySelectorAll('.hiw-card'));
  
  // Calculate total distance to scroll based on the cards' width minus viewport width
  const totalMovement = -(container.scrollWidth - window.innerWidth + 100);

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: '+=1500', // Faster scrub speed
      pin: true,
      scrub: 1,
      anticipatePin: 1
    }
  });

  tl.to(container, {
    x: totalMovement,
    ease: 'none',
    duration: 1
  });

  // Optional: Animate progress bar or line if it exists
  const line = section.querySelector('.hiw-progress-line');
  if (line) {
    tl.fromTo(line, 
      { scaleX: 0, transformOrigin: 'left center' },
      { scaleX: 1, ease: 'none', duration: 1 },
      0
    );
  }

  // Set initial state for cards
  gsap.set(cards, { opacity: 0.3, scale: 0.95 });

  // Use containerAnimation to trigger card activations as they scroll horizontally
  cards.forEach((card, i) => {
    // We want the card to "activate" when it crosses the center of the viewport horizontally
    gsap.to(card, {
      opacity: 1,
      scale: 1,
      duration: 0.5,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: card,
        containerAnimation: tl, // Bind to the horizontal timeline
        start: 'left 70%',     // Activate when card's left edge hits 70% of screen
        end: 'right 30%',      // Deactivate when it leaves
        toggleActions: 'play reverse play reverse',
        onEnter: () => gsap.to(card.querySelector('.inline-grid'), { scale: 1.2, rotation: 5, ease: 'back.out(1.5)' }),
        onLeave: () => gsap.to(card.querySelector('.inline-grid'), { scale: 1, rotation: 0 }),
        onEnterBack: () => gsap.to(card.querySelector('.inline-grid'), { scale: 1.2, rotation: 5, ease: 'back.out(1.5)' }),
        onLeaveBack: () => gsap.to(card.querySelector('.inline-grid'), { scale: 1, rotation: 0 }),
      }
    });
  });

  return tl;
};
