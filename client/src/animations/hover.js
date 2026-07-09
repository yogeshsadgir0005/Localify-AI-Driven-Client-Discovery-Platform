import gsap from 'gsap';
import { prefersReducedMotion, hasFinePointer } from './utilities';

/**
 * Initializes glowing/rotating hover states for a list of cards
 * @param {Array|NodeList} cards - DOM elements to attach hover listeners to
 */
export const initHoverEffects = (cards) => {
  if (prefersReducedMotion() || !hasFinePointer()) return;

  const cleanupListeners = [];

  cards.forEach((card) => {
    const xTo = gsap.quickTo(card, "rotationY", { duration: 0.5, ease: "power3.out" });
    const yTo = gsap.quickTo(card, "rotationX", { duration: 0.5, ease: "power3.out" });
    const scaleTo = gsap.quickTo(card, "scale", { duration: 0.5, ease: "power3.out" });

    const handleMouseMove = (e) => {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Calculate distance from center (-1 to 1)
      const moveX = (e.clientX - centerX) / (rect.width / 2);
      const moveY = (e.clientY - centerY) / (rect.height / 2);

      // Max rotation: 5 degrees
      xTo(moveX * 5);
      yTo(-moveY * 5); // Invert Y for correct tilt
    };

    const handleMouseEnter = () => {
      scaleTo(1.02);
      gsap.to(card, { boxShadow: '0 20px 40px -20px rgba(0, 212, 170, 0.15)', zIndex: 10, duration: 0.3 });
      
      // Dim and push back siblings
      const siblings = Array.from(cards).filter(c => c !== card);
      if (siblings.length > 0) {
        gsap.to(siblings, {
          scale: 0.95,
          opacity: 0.6,
          duration: 0.4,
          ease: 'power2.out'
        });
      }
    };

    const handleMouseLeave = () => {
      xTo(0);
      yTo(0);
      scaleTo(1);
      gsap.to(card, { boxShadow: 'none', zIndex: 1, duration: 0.3 });
      
      // Restore siblings
      const siblings = Array.from(cards).filter(c => c !== card);
      if (siblings.length > 0) {
        gsap.to(siblings, {
          scale: 1,
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out'
        });
      }
    };

    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseenter', handleMouseEnter);
    card.addEventListener('mouseleave', handleMouseLeave);

    cleanupListeners.push(() => {
      card.removeEventListener('mousemove', handleMouseMove);
      card.removeEventListener('mouseenter', handleMouseEnter);
      card.removeEventListener('mouseleave', handleMouseLeave);
    });
  });

  return () => {
    cleanupListeners.forEach(cleanup => cleanup());
  };
};
