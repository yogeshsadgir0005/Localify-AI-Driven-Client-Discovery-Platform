import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Server, Zap, CheckCircle, Code, LayoutTemplate } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';

const WebsiteGeneratorPage = () => {
  const { placeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuthStore();
  
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing AI Core...');
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);

  // Formatting clock
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  // Run-once guard: React StrictMode (dev) mounts effects twice, and a stray
  // re-render could re-fire generation. startedRef ensures we kick off exactly
  // ONE generation request; activeRef gates state updates so a real unmount
  // doesn't setState on an unmounted component. This is what stops the
  // "two racing pipelines / two different section sets" bug at the source.
  const startedRef = useRef(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    if (!location.state?.survey) {
      toast.error("Missing survey data. Please start generation from the business profile.");
      navigate(`/business/${placeId}`);
      return () => { activeRef.current = false; };
    }

    if (startedRef.current) {
      // Generation already kicked off for this mount — do not fire a second one.
      return () => { activeRef.current = false; };
    }
    startedRef.current = true;

    const startGeneration = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const response = await fetch(`${API_BASE}/website/${placeId}/generate?stream=true`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ survey: location.state.survey })
        });

        if (!response.ok) {
          if (response.status === 403) throw new Error('QUOTA_EXCEEDED');
          if (response.status === 409) throw new Error('ALREADY_GENERATING');
          throw new Error('Failed to connect to AI generation server.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!activeRef.current) return; // component unmounted — stop updating

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.replace('data: ', ''));
                if (!activeRef.current) return;

                if (data.error) { setError(data.error); return; }
                if (data.progress !== undefined) setProgress(prev => Math.max(prev, data.progress));
                if (data.message) setStatus(data.message);

                if (data.status === 'Done') {
                  setProgress(100);
                  setStatus('Website Generation Complete!');
                  setTimeout(() => { if (activeRef.current) navigate(`/business/website/${placeId}`); }, 1000);
                  return;
                }
              } catch (e) {
                // Ignore parse errors on incomplete chunks
              }
            }
          }
        }
      } catch (err) {
        if (!activeRef.current || err.name === 'AbortError') return;
        if (err.message === 'QUOTA_EXCEEDED') setError('AI Quota Exceeded. Please upgrade your plan.');
        else if (err.message === 'ALREADY_GENERATING') setError('A website is already being generated for this business. Please wait for it to finish, then refresh.');
        else setError(err.message);
      }
    };

    startGeneration();

    return () => { activeRef.current = false; };
  }, [placeId, navigate, token, location.state]);

  const getIcon = () => {
    if (progress === 100) return <CheckCircle className="h-12 w-12 text-primary" />;
    if (progress > 50) return <Code className="h-12 w-12 text-primary animate-pulse" />;
    if (progress > 10) return <LayoutTemplate className="h-12 w-12 text-accent animate-pulse" />;
    return <Server className="h-12 w-12 text-primary animate-pulse" />;
  };

  return (
    <Layout>
      <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
        {error ? (
          <div className="flex flex-col items-center text-center max-w-md">
            <div className="h-16 w-16 rounded-full bg-error/10 flex items-center justify-center mb-6">
              <Zap className="h-8 w-8 text-error" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Generation Failed</h1>
            <p className="text-text-muted mb-8">{error}</p>
            <button onClick={() => navigate(`/business/${placeId}`)} className="btn-primary">
              Return to Profile
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center w-full max-w-xl">
            {/* Pulsing Core */}
            <div className="relative mb-12 flex h-32 w-32 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
              <div className="absolute inset-2 rounded-full border border-primary/50 animate-spin-slow" />
              <div className="absolute inset-4 rounded-full border border-accent/30 animate-reverse-spin" />
              <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 shadow-2xl">
                {getIcon()}
              </div>
            </div>

            {/* Progress & Clock */}
            <h1 className="font-display text-3xl font-bold text-white mb-4">
              Building Your Website
            </h1>
            
            <div className="flex items-center gap-6 mb-8 text-2xl font-mono tracking-wider font-bold">
              <span className="text-primary">{progress}%</span>
              <span className="text-text-muted/30">|</span>
              <span className="text-text">{formatTime(elapsed)}</span>
            </div>

            <p className="text-lg text-text-muted mb-12 min-h-[2rem]">
              {status}
            </p>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default WebsiteGeneratorPage;
