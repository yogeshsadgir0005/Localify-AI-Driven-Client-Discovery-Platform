import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './utilities';

gsap.registerPlugin(ScrollTrigger);

/**
 * Initializes staggered card reveals for specific sections
 * @param {NodeList|Array} sections - The DOM sections to target
 * @param {boolean} isDesktop - Conditionally adjust stagger amount
 */
export const initSectionReveals = (sections, isDesktop = true) => {
  if (prefersReducedMotion()) {
    gsap.set('.reveal-card', { opacity: 1, y: 0 });
    return;
  }

  const staggerAmount = isDesktop ? 0.1 : 0.05;

  sections.forEach(section => {
    // Select headers, pills, and cards inside the section
    const elements = section.querySelectorAll('.pill, h2, p, .reveal-card, .btn-primary, .btn-ghost, .hero-trust, .parallax-text');
    
    if (elements.length > 0) {
      gsap.fromTo(elements, 
        { opacity: 0, y: 50 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.8, 
          stagger: staggerAmount, 
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
          }
        }
      );
    }
  });
};
