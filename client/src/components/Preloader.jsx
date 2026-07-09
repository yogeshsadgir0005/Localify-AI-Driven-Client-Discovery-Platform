import { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { prefersReducedMotion } from '../animations/utilities';

export default function Preloader() {
  const [progress, setProgress] = useState(0);
  const containerRef = useRef(null);
  const panelsRef = useRef([]);
  const textRef = useRef(null);

  useGSAP(() => {
    if (prefersReducedMotion()) {
      gsap.set(containerRef.current, { display: 'none' });
      return;
    }

    // Fake loading progress
    const proxy = { value: 0 };
    const tl = gsap.timeline();

    tl.to(proxy, {
      value: 100,
      duration: 2.5,
      ease: 'power3.inOut',
      onUpdate: () => setProgress(Math.round(proxy.value))
    })
    .to(textRef.current, {
      opacity: 0,
      y: -20,
      duration: 0.5,
      ease: 'power2.in'
    }, "-=0.2")
    // Slide the panels up with a stagger
    .to(panelsRef.current, {
      yPercent: -100,
      duration: 1.2,
      stagger: 0.1,
      ease: 'power4.inOut',
    })
    // Hide container entirely to unblock pointer events
    .set(containerRef.current, { display: 'none' });

  }, { scope: containerRef });

  return (
    <div ref={containerRef} className="fixed inset-0 z-[9998] flex bg-transparent pointer-events-none">
      {/* Absolute text layer in the center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[9999]">
        <div ref={textRef} className="flex flex-col items-center">
          <span className="text-6xl font-bold text-white tracking-tighter mix-blend-difference">{progress}%</span>
          <div className="w-48 h-[2px] bg-white/20 mt-4 rounded overflow-hidden">
            <div 
              className="h-full bg-white will-change-transform" 
              style={{ width: `${progress}%`, transition: 'width 0.1s linear' }} 
            />
          </div>
        </div>
      </div>

      {/* 5 Vertical Panels */}
      {[...Array(5)].map((_, i) => (
        <div 
          key={i}
          ref={el => panelsRef.current[i] = el}
          className="h-full flex-1 bg-black pointer-events-auto will-change-transform"
        />
      ))}
    </div>
  );
}
