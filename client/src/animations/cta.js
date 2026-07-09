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

  const box = section.querySelector('.cta-spotlight-box');
  const title = section.querySelector('.cta-title');
  const pill = section.querySelector('.pill');
  const desc = section.querySelector('p');
  const button = section.querySelector('.btn-primary');
  
  if (!box || !title) return;

  // Split the text for the staggered reveal
  const splitTitle = new SplitText(title, { type: 'words,chars' });

  // Reset the box to its initial "unbuilt" state
  gsap.set(box, { 
    borderWidth: 0, 
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    boxShadow: 'none'
  });
  gsap.set([pill, desc, button], { opacity: 0, y: 20 });
  gsap.set(splitTitle.chars, { opacity: 0, y: 40 });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top 70%', 
      toggleActions: 'play none none reverse'
    }
  });

  // Step 1: Draw the border frame
  tl.to(box, {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    duration: 0.5,
    ease: 'power2.inOut'
  })
  // Step 2: Fade in the background and glows
  .to(box, {
    backgroundColor: 'rgba(255,255,255,0.03)',
    boxShadow: '0 0 100px rgba(0,212,170,0.1)',
    duration: 0.6,
    ease: 'power2.out'
  }, '-=0.2')
  // Step 3: Pill drops in
  .to(pill, {
    opacity: 1,
    y: 0,
    duration: 0.5,
    ease: 'back.out(1.5)'
  }, '-=0.3')
  // Step 4: Text staggers up
  .to(splitTitle.chars, {
    opacity: 1,
    y: 0,
    stagger: 0.02,
    duration: 0.6,
    ease: 'power3.out'
  }, '-=0.3')
  // Step 5: Description fades in
  .to(desc, {
    opacity: 1,
    y: 0,
    duration: 0.5,
    ease: 'power2.out'
  }, '-=0.4')
  // Step 6: Button pops into place
  .to(button, {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.6,
    ease: 'elastic.out(1, 0.5)'
  }, '-=0.2');

  return () => splitTitle.revert();
};
