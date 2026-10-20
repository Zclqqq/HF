import React from 'react';
import { RotateCcw, LayoutDashboard } from 'lucide-react';

interface QueueCompleteViewProps {
  totalTrained: number;
  isAdmin: boolean;
  onGoToDashboard: () => void;
  onResetQueue: () => void;
}

export const QueueCompleteView: React.FC<QueueCompleteViewProps> = ({
  totalTrained,
  isAdmin,
  onGoToDashboard,
  onResetQueue,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-none p-8 sm:p-12 text-center max-w-lg mx-auto">
      <h2 className="text-xl font-bold text-slate-900 mb-2">
        כל הפרומפטים הושלמו בהצלחה
      </h2>
      <p className="text-sm text-slate-600 mb-6">
        סה״כ פרומפטים שאומנו: <span className="font-bold font-mono">[{totalTrained}]</span>
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={onResetQueue}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer rounded-none"
        >
          <RotateCcw className="w-4 h-4" />
          <span>התחל סבב אימון חדש</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={onGoToDashboard}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 hover:border-slate-800 text-slate-800 text-sm font-semibold transition-colors cursor-pointer rounded-none"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>צפייה בדשבורד מנהל</span>
          </button>
        )}
      </div>
    </div>
  );
};
