import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './utilities';

gsap.registerPlugin(ScrollTrigger);

/**
 * Initializes a 3D falling/stacking sequence for a grid of cards
 * @param {HTMLElement} section - The container holding the grid
 * @param {boolean} isDesktop
 */
export const initFeatures3D = (section, isDesktop = true) => {
  if (!section || prefersReducedMotion() || !isDesktop) return;

  const cards = gsap.utils.toArray(section.querySelectorAll('.feature-3d-card'));
  
  // Set initial 3D state
  gsap.set(section.querySelector('.feature-grid-container'), { perspective: 2000, transformStyle: "preserve-3d" });
  
  // Define distinct starting vectors for a spatial assembly feel
  const vectors = [
    { x: -300, y: -200, z: 600, rotationX: 45, rotationY: -45, rotationZ: -10 },
    { x: 0, y: -400, z: 800, rotationX: 60, rotationY: 0, rotationZ: 0 },
    { x: 300, y: -200, z: 600, rotationX: 45, rotationY: 45, rotationZ: 10 },
    { x: -300, y: 200, z: 400, rotationX: -45, rotationY: -30, rotationZ: -5 },
    { x: 0, y: 300, z: 500, rotationX: -60, rotationY: 0, rotationZ: 0 },
    { x: 300, y: 200, z: 400, rotationX: -45, rotationY: 30, rotationZ: 5 },
  ];

  cards.forEach((card, index) => {
    const vector = vectors[index % vectors.length];
    
    gsap.fromTo(card,
      {
        ...vector,
        opacity: 0,
        scale: 0.8
      },
      {
        x: 0, y: 0, z: 0,
        rotationX: 0, rotationY: 0, rotationZ: 0,
        opacity: 1,
        scale: 1,
        duration: 1.5,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 80%',
          // Use scrub for a physical scroll-tied fall, or standard for a triggered animation.
          // The prompt asked for "smoothly assemble into their final positions using GSAP timelines".
          // We will use standard trigger, but staggered starting times by distance.
          toggleActions: 'play none none reverse'
        },
        delay: index * 0.05 // Stagger their arrivals slightly
      }
    );
  });
};
