import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { prefersReducedMotion } from './utilities';

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * Initializes the explosive clip-path expansion for the CTA section
 * @param {HTMLElement} section - The outer section containing the CTA
 * @param {boolean} isDesktop
 */
export const initCtaSpotlight = (section, isDesktop = true) => {
  if (!section || prefersReducedMotion()) return;

  const title = section.querySelector('.cta-title');
  const pill = section.querySelector('.pill');
  const desc = section.querySelector('p');
  const button = section.querySelector('.btn-primary');
  
  if (!title) return;

  // Split the text for the staggered reveal
  const splitTitle = new SplitText(title, { type: 'words,chars' });

  gsap.set([pill, desc, button], { opacity: 0, y: 20 });
  gsap.set(splitTitle.chars, { opacity: 0, y: 40 });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top 85%', // Trigger earlier
      toggleActions: 'play none none reverse'
    }
  });

  tl.to(pill, {
    opacity: 1,
    y: 0,
    duration: 0.4,
    ease: 'back.out(1.5)'
  })
  .to(splitTitle.chars, {
    opacity: 1,
    y: 0,
    stagger: 0.01,
    duration: 0.4,
    ease: 'power3.out'
  }, '-=0.2')
  .to(desc, {
    opacity: 1,
    y: 0,
    duration: 0.4,
    ease: 'power2.out'
  }, '-=0.2')
  .to(button, {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.5,
    ease: 'elastic.out(1, 0.5)'
  }, '-=0.2');

  return () => splitTitle.revert();
};
