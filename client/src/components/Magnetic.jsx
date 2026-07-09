import { useRef, cloneElement, Children } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion, hasFinePointer } from '../animations/utilities';

export default function Magnetic({ children, strength = 0.5 }) {
  const magneticRef = useRef(null);
  
  useGSAP(() => {
    if (prefersReducedMotion() || !hasFinePointer()) return;

    const el = magneticRef.current;
    if (!el) return;

    // Use quickTo for highly performant, spring-like translation
    const xTo = gsap.quickTo(el, "x", { duration: 1, ease: "elastic.out(1, 0.3)" });
    const yTo = gsap.quickTo(el, "y", { duration: 1, ease: "elastic.out(1, 0.3)" });

    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      const { height, width, left, top } = el.getBoundingClientRect();
      
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      const distanceX = clientX - centerX;
      const distanceY = clientY - centerY;

      xTo(distanceX * strength);
      yTo(distanceY * strength);
    };

    const handleMouseLeave = () => {
      xTo(0);
      yTo(0);
    };

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, { scope: magneticRef });

  return cloneElement(Children.only(children), { ref: magneticRef, className: `${children.props.className || ''} will-change-transform` });
}
