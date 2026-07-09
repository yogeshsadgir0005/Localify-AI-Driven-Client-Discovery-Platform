import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion, hasFinePointer } from '../animations/utilities';

export default function CustomCursor() {
  const cursorRef = useRef(null);
  const dotRef = useRef(null);

  useGSAP(() => {
    if (prefersReducedMotion() || !hasFinePointer()) {
      // Clean up fully if disabled
      gsap.set([cursorRef.current, dotRef.current], { display: 'none' });
      return;
    }

    // Show the custom cursor
    gsap.set([cursorRef.current, dotRef.current], { autoAlpha: 1 });
    
    // quickTo is highly performant for tracking mouse movement
    const xToCursor = gsap.quickTo(cursorRef.current, 'x', { duration: 0.6, ease: 'power3' });
    const yToCursor = gsap.quickTo(cursorRef.current, 'y', { duration: 0.6, ease: 'power3' });
    
    const xToDot = gsap.quickTo(dotRef.current, 'x', { duration: 0.1, ease: 'power3' });
    const yToDot = gsap.quickTo(dotRef.current, 'y', { duration: 0.1, ease: 'power3' });

    const handleMouseMove = (e) => {
      xToCursor(e.clientX);
      yToCursor(e.clientY);
      xToDot(e.clientX);
      yToDot(e.clientY);
    };

    const handleMouseEnter = () => {
      gsap.to(cursorRef.current, { scale: 1.5, duration: 0.3, ease: 'power2.out' });
    };

    const handleMouseLeave = () => {
      gsap.to(cursorRef.current, { scale: 1, duration: 0.3, ease: 'power2.out' });
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Add listeners to all interactive elements to expand the cursor
    const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
    interactiveElements.forEach((el) => {
      el.addEventListener('mouseenter', handleMouseEnter);
      el.addEventListener('mouseleave', handleMouseLeave);
    });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      interactiveElements.forEach((el) => {
        el.removeEventListener('mouseenter', handleMouseEnter);
        el.removeEventListener('mouseleave', handleMouseLeave);
      });
    };
  });

  return (
    <>
      <div 
        ref={cursorRef} 
        className="fixed top-0 left-0 w-10 h-10 border-2 border-white rounded-full pointer-events-none mix-blend-difference z-[9999] opacity-0 -ml-5 -mt-5 will-change-transform"
      />
      <div 
        ref={dotRef} 
        className="fixed top-0 left-0 w-2 h-2 bg-white rounded-full pointer-events-none mix-blend-difference z-[10000] opacity-0 -ml-1 -mt-1 will-change-transform"
      />
    </>
  );
}
