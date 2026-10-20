import React, { useState, useEffect, useRef } from 'react';
import { TrainingPrompt } from '../types';

interface TrainingCardProps {
  prompt: TrainingPrompt;
  isSubmitting: boolean;
  selectedOption: 'A' | 'B' | null;
  onChooseOption: (option: 'A' | 'B') => void;
  onSkipPrompt: () => void;
}

export const TrainingCard: React.FC<TrainingCardProps> = ({
  prompt,
  isSubmitting,
  selectedOption,
  onChooseOption,
  onSkipPrompt,
}) => {
  // Silent 2-second click blocker: Looks completely active from the start, but ignores clicks before 2 seconds
  const [canAnswer, setCanAnswer] = useState<boolean>(false);
  const promptIdRef = useRef<string>(prompt.id);

  useEffect(() => {
    promptIdRef.current = prompt.id;
    setCanAnswer(false);
    const timer = setTimeout(() => {
      setCanAnswer(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [prompt.id]);

  const handleOptionClick = (option: 'A' | 'B') => {
    // Silently ignore clicks before 2 seconds have elapsed or while submitting
    if (!canAnswer || isSubmitting) {
      return;
    }
    onChooseOption(option);
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center">
      {/* The Unified Card with strict sharp non-rounded borders */}
      <div className="w-full bg-white border border-slate-200 rounded-none p-7 sm:p-10 shadow-xs flex flex-col items-center text-center">
        {/* Big Central Prompt Question */}
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug tracking-tight mb-8 sm:mb-10 max-w-md whitespace-pre-wrap select-text">
          {prompt.prompt}
        </h2>

        {/* Side-by-side Choice Boxes - always looks active and clickable (no greyed out appearance) */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          {/* Option A Box */}
          <button
            type="button"
            onClick={() => handleOptionClick('A')}
            className={`flex flex-col items-center justify-center p-4 sm:p-5 border-2 rounded-none transition-colors duration-100 text-center select-none cursor-pointer ${
              selectedOption === 'A'
                ? 'border-emerald-600 bg-emerald-50/70 text-slate-900'
                : 'border-slate-300 hover:border-slate-800 bg-white hover:bg-slate-50 text-slate-900'
            }`}
          >
            <span className="text-xs font-bold text-slate-500 mb-1.5">
              אפשרות א':
            </span>
            <span className="text-sm sm:text-base font-semibold leading-relaxed">
              {prompt.responseA}
            </span>
          </button>

          {/* Option B Box */}
          <button
            type="button"
            onClick={() => handleOptionClick('B')}
            className={`flex flex-col items-center justify-center p-4 sm:p-5 border-2 rounded-none transition-colors duration-100 text-center select-none cursor-pointer ${
              selectedOption === 'B'
                ? 'border-emerald-600 bg-emerald-50/70 text-slate-900'
                : 'border-slate-300 hover:border-slate-800 bg-white hover:bg-slate-50 text-slate-900'
            }`}
          >
            <span className="text-xs font-bold text-slate-500 mb-1.5">
              אפשרות ב':
            </span>
            <span className="text-sm sm:text-base font-semibold leading-relaxed">
              {prompt.responseB}
            </span>
          </button>
        </div>
      </div>

      {/* Secondary Discreet Skip Control Below the Card */}
      <div className="mt-5 text-center">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSkipPrompt}
          className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-4 transition-colors disabled:opacity-40 cursor-pointer"
        >
          דלג על פרומפט
        </button>
      </div>
    </div>
  );
};
