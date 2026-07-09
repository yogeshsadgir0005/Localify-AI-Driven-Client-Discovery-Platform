import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { prefersReducedMotion } from './utilities';

/**
 * Initializes the Hero section animations.
 * @param {boolean} isDesktop - Used to conditionally adjust animation properties
 * @returns {function} Cleanup function to revert SplitText
 */
export const initHeroAnimation = (isDesktop = true) => {
  if (prefersReducedMotion()) {
    gsap.set('.gsap-reveal, .hero-preview-panel, .hero-preview-card, .hero-preview-chip', { 
      opacity: 1, y: 0, x: 0, rotate: 0, scale: 1, filter: 'blur(0px)' 
    });
    return () => {};
  }

  const splitTitle = new SplitText('.hero-title', { type: 'words,chars' });
  const tl = gsap.timeline({ delay: 0.1 });
  
  // Conditionally disable some heavier effects on mobile
  const staggerAmount = isDesktop ? 0.02 : 0.01;
  const initialBlur = isDesktop ? 'blur(8px)' : 'blur(0px)'; // Blur is expensive on mobile

  tl.to('.hero-pill', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' })
    .fromTo(splitTitle.chars, 
      { yPercent: 120, opacity: 0, filter: initialBlur },
      { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 0.8, stagger: staggerAmount, ease: 'power4.out' },
      "-=0.4"
    )
    .to('.hero-desc', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, "-=0.6")
    .to('.hero-buttons', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, "-=0.6")
    .to('.hero-trust', { opacity: 1, duration: 1, ease: 'power2.out' }, "-=0.4")
    
    // Hero Preview Panel
    .to('.hero-preview-panel', { opacity: 1, y: 0, rotate: 0, duration: 0.8, ease: 'back.out(1.2)' }, "-=1.2")
    .to('.hero-preview-card', { opacity: 1, x: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out' }, "-=0.6")
    .to('.hero-preview-chip', { opacity: 1, scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' }, "-=0.4");

  return () => splitTitle.revert();
};
