import { useState, useMemo } from 'react';
import { Loader2, Wand2, X, ChevronRight, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSurveyQuestions } from '../utils/surveyQuestions';

const WebsiteSurveyModal = ({ isOpen, onClose, onGenerate, onTopUp, user, planLimit, business }) => {
  try {
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState({});

    const QUESTIONS = useMemo(() => getSurveyQuestions(business), [business]);

    if (!isOpen) return null;

    const usage = user?.aiQuota?.usage || 0;
    const extra = user?.aiQuota?.extraCredits || 0;
    const remainingWeekly = Math.max(0, planLimit - usage);
    const totalRemaining = remainingWeekly + extra;
    const isAdmin = user?.roles?.includes('admin');

    const handleOptionSelect = (option) => {
      setAnswers({ ...answers, [QUESTIONS[currentStep].id]: option });
      if (currentStep < QUESTIONS.length - 1) {
        setCurrentStep(curr => curr + 1);
      }
    };

    const handleSubmit = (e) => {
      if (e) e.preventDefault();
      if (isAdmin || totalRemaining > 0) {
        onGenerate(answers);
      }
    };

    const currentQ = QUESTIONS[currentStep];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-border">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-text-muted hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mb-6">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-text">
              <Wand2 className="h-6 w-6 text-accent" />
              AI Website Generator
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Our AI will analyze the business's Google Maps photos to extract the brand color, and use your answers to write the code.
            </p>
          </div>

          <div className="mb-6 rounded-lg bg-surface-2 p-3 text-sm flex items-center justify-between">
            <span className="text-text font-medium">Credits: <span className="font-bold text-accent">{isAdmin ? 'Unlimited' : totalRemaining}</span></span>
            <span className="text-text-muted text-xs">Step {currentStep + 1} of {QUESTIONS?.length || 0}</span>
          </div>

          {!isAdmin && totalRemaining <= 0 ? (
            <div className="text-center py-4">
              <p className="mb-4 text-sm text-red-400">
                You have run out of AI Website Generation credits.
              </p>
              <button
                onClick={onTopUp}
                className="btn-primary w-full bg-accent hover:bg-accent/90"
              >
                Top Up Credits
              </button>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold text-text mb-4">{currentQ?.title}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {currentQ?.options?.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleOptionSelect(opt)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      answers[currentQ.id] === opt 
                        ? 'border-accent bg-accent/10 ring-1 ring-accent text-text' 
                        : 'border-border bg-surface-2 hover:bg-surface text-text-muted hover:text-text'
                    }`}
                  >
                    <span className="block font-medium">{opt}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
                <button
                  onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                  disabled={currentStep === 0}
                  className="btn-ghost"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </button>
                
                {currentStep === (QUESTIONS?.length || 0) - 1 ? (
                  <button 
                    onClick={handleSubmit} 
                    disabled={!answers[currentQ?.id]}
                    className="btn-primary gap-2 bg-accent hover:bg-accent/90"
                  >
                    <Wand2 className="h-4 w-4" />
                    Generate Magic
                  </button>
                ) : (
                  <button 
                    onClick={() => setCurrentStep(curr => curr + 1)}
                    disabled={!answers[currentQ?.id]}
                    className="btn-primary"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
        <div className="bg-white p-6 rounded text-black max-w-lg w-full">
          <h1 className="text-red-500 font-bold text-xl mb-4">Modal Crash</h1>
          <pre className="whitespace-pre-wrap text-sm text-red-600 font-mono">{err.stack || err.message || String(err)}</pre>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 rounded text-black">Close</button>
        </div>
      </div>
    );
  }
};

export default WebsiteSurveyModal;
