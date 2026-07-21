import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useGenerationStore } from '../store/generationStore';
import {
  Server, Zap, CheckCircle, Code, LayoutTemplate,
  ArrowLeft, Loader2, Circle, Clock, Sparkles,
  Cpu, Search, Package, Rocket,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';

/**
 * Map a pipeline status string to a user-friendly phase label + icon.
 */
const PHASE_STEPS = [
  { key: 'init',      match: (s) => s === 'Init',      label: 'Analyzing business',        icon: Search },
  { key: 'phase1a',   match: (s) => s === 'Phase 1' ,  label: 'Designing premium UI',      icon: Sparkles },
  { key: 'phase1b',   match: (s) => false,              label: 'Architecting sections',     icon: Cpu },
  // Sections are injected dynamically between phase1 and qa
  { key: 'qa',        match: (s) => s.startsWith('QA'), label: 'Quality check',             icon: Search },
  { key: 'assembly',  match: (s) => s === 'Assembly',   label: 'Final assembly',            icon: Package },
  { key: 'complete',  match: (s) => s === 'Complete' || s === 'Done', label: 'Complete',    icon: Rocket },
];

const WebsiteGeneratorPage = () => {
  const { placeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  const { startGeneration, reconnect, checkStatus, getGeneration, activeGenerations } = useGenerationStore();
  const gen = activeGenerations[placeId] || null;

  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Clock
  useEffect(() => {
    if (gen?.startTime) startTimeRef.current = gen.startTime;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [gen?.startTime]);

  // Navigate to website on completion
  useEffect(() => {
    if (gen?.completed) {
      const timer = setTimeout(() => navigate(`/business/website/${placeId}`), 1500);
      return () => clearTimeout(timer);
    }
  }, [gen?.completed, placeId, navigate]);

  // Start or reconnect generation
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const init = async () => {
      // Case 1: Generation already tracked in global store
      if (gen && !gen.completed && !gen.error) return;

      // Case 2: Fresh start from survey
      if (location.state?.survey) {
        const businessName = location.state?.businessName || 'Business';
        startGeneration(placeId, businessName, token, location.state.survey);
        return;
      }

      // Case 3: Returning to page (no survey state) — check if server has active generation
      const serverState = await checkStatus(placeId);
      if (serverState) {
        reconnect(placeId, token);
        return;
      }

      // Case 4: No survey, no active generation — redirect back
      toast.error('Missing survey data. Please start generation from the business profile.');
      navigate(`/business/${placeId}`);
    };

    init();
  }, [placeId]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const progress = gen?.progress || 0;
  const status = gen?.status || '';
  const message = gen?.message || 'Initializing...';
  const error = gen?.error || null;
  const sectionPlan = gen?.sectionPlan || [];
  const completedSections = gen?.completedSections || [];

  // Build the full step list: fixed phases + dynamic sections
  const buildStepList = () => {
    const steps = [];

    // Phase 1 steps
    steps.push({ id: 'init', label: 'Analyzing business', icon: Search });
    steps.push({ id: 'phase1', label: 'Designing premium UI', icon: Sparkles });
    steps.push({ id: 'architect', label: 'Architecting sections', icon: Cpu });

    // Dynamic section steps
    if (sectionPlan.length > 0) {
      sectionPlan.forEach((id) => {
        const label = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        steps.push({ id: `section-${id}`, sectionId: id, label: `Building ${label}`, icon: Code });
      });
    }

    // Post-section steps
    steps.push({ id: 'qa', label: 'Quality check', icon: Search });
    steps.push({ id: 'assembly', label: 'Final assembly', icon: Package });

    return steps;
  };

  const getStepStatus = (step) => {
    if (gen?.completed) return 'done';

    // Fixed phases
    if (step.id === 'init') {
      if (progress > 5) return 'done';
      if (progress >= 0 && (status === 'Init' || status === '')) return 'active';
      return 'pending';
    }
    if (step.id === 'phase1') {
      if (progress > 12) return 'done';
      if (status === 'Phase 1' && progress <= 12) return 'active';
      if (progress > 5) return 'active';
      return 'pending';
    }
    if (step.id === 'architect') {
      if (progress >= 20) return 'done';
      if (progress > 12) return 'active';
      return 'pending';
    }

    // Dynamic sections
    if (step.sectionId) {
      if (completedSections.includes(step.sectionId)) return 'done';
      
      if (progress >= 20 && progress < 92) {
        const firstPending = sectionPlan.find(id => !completedSections.includes(id));
        if (step.sectionId === firstPending) return 'active';
      }
      
      return 'pending';
    }

    // QA
    if (step.id === 'qa') {
      if (progress >= 92) return 'done';
      if (status.startsWith('QA')) return 'active';
      return 'pending';
    }

    // Assembly
    if (step.id === 'assembly') {
      if (progress >= 100) return 'done';
      if (status === 'Assembly') return 'active';
      return 'pending';
    }

    return 'pending';
  };

  const steps = buildStepList();

  const getMainIcon = () => {
    if (progress === 100) return <CheckCircle className="h-12 w-12 text-primary" />;
    if (progress > 50) return <Code className="h-12 w-12 text-primary animate-pulse" />;
    if (progress > 10) return <LayoutTemplate className="h-12 w-12 text-accent animate-pulse" />;
    return <Server className="h-12 w-12 text-primary animate-pulse" />;
  };

  return (
    <Layout>
      <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 py-8">
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
            {/* Back Button */}
            <button
              onClick={() => navigate(`/business/${placeId}`)}
              className="self-start mb-8 flex items-center gap-2 text-text-muted hover:text-primary transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-medium">Back to Business</span>
            </button>

            {/* Pulsing Core */}
            <div className="relative mb-8 flex h-28 w-28 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
              <div className="absolute inset-2 rounded-full border border-primary/50 animate-spin-slow" />
              <div className="absolute inset-4 rounded-full border border-accent/30 animate-reverse-spin" />
              <div className="relative z-10 flex h-18 w-18 items-center justify-center rounded-full bg-surface-2 shadow-2xl">
                {getMainIcon()}
              </div>
            </div>

            {/* Title & Clock */}
            <h1 className="font-display text-2xl font-bold text-white mb-3">
              {gen?.completed ? 'Website Ready!' : 'Building Your Website'}
            </h1>

            <div className="flex items-center gap-5 mb-6 text-xl font-mono tracking-wider font-bold">
              <span className="text-primary">{progress}%</span>
              <span className="text-text-muted/30">|</span>
              <div className="flex items-center gap-1.5 text-text">
                <Clock className="h-4 w-4 text-text-muted" />
                <span>{formatTime(elapsed)}</span>
              </div>
            </div>

            {/* Current Status Message */}
            <p className="text-sm text-text-muted mb-8 min-h-[1.5rem]">
              {message}
            </p>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden mb-10">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Section Checklist */}
            <div className="w-full max-w-sm text-left space-y-1">
              {steps.map((step) => {
                const stepStatus = getStepStatus(step);
                const StepIcon = step.icon;

                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 ${
                      stepStatus === 'active'
                        ? 'bg-primary/10 border border-primary/20'
                        : stepStatus === 'done'
                        ? 'opacity-60'
                        : 'opacity-30'
                    }`}
                  >
                    {/* Status indicator */}
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {stepStatus === 'done' ? (
                        <CheckCircle className="h-4.5 w-4.5 text-green-400" />
                      ) : stepStatus === 'active' ? (
                        <Loader2 className="h-4.5 w-4.5 text-primary animate-spin" />
                      ) : (
                        <Circle className="h-4 w-4 text-text-muted/40" />
                      )}
                    </div>

                    {/* Icon */}
                    <StepIcon className={`h-4 w-4 flex-shrink-0 ${
                      stepStatus === 'active' ? 'text-primary' : stepStatus === 'done' ? 'text-green-400/60' : 'text-text-muted/30'
                    }`} />

                    {/* Label */}
                    <span className={`text-sm font-medium ${
                      stepStatus === 'active' ? 'text-text' : stepStatus === 'done' ? 'text-text-muted' : 'text-text-muted/50'
                    }`}>
                      {step.label}
                      {stepStatus === 'active' && <span className="text-primary ml-1">...</span>}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Subtle hint about back button */}
            {!gen?.completed && (
              <p className="mt-8 text-xs text-text-muted/40">
                You can navigate away — generation will continue in the background
              </p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default WebsiteGeneratorPage;
