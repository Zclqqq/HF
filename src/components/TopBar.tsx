import React from 'react';
import { AnnotatorUser } from '../types';
import { LayoutDashboard, LogOut, ArrowRight } from 'lucide-react';

interface TopBarProps {
  user: AnnotatorUser;
  trainedCount: number;
  isJustIncremented: boolean;
  activeTab: 'training' | 'dashboard';
  onTabChange: (tab: 'training' | 'dashboard') => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  user,
  trainedCount,
  isJustIncremented,
  activeTab,
  onTabChange,
  onLogout,
}) => {
  const isAdmin = user.email.toLowerCase().trim() === 'nach.vidan@gmail.com';

  return (
    <header className="sticky top-0 z-30 bg-[#fafafa]/90 backdrop-blur-xs py-4">
      <div className="max-w-xl mx-auto px-4 flex items-center justify-between">
        {/* Real-time Minimalist Contribution Counter */}
        <div
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-none border transition-all duration-200 ${
            isJustIncremented
              ? 'bg-slate-900 border-slate-900 text-white scale-105'
              : 'bg-white border-slate-200 text-slate-800 shadow-2xs'
          }`}
        >
          <span className="text-xs font-medium text-slate-500">
            סה״כ פרומפטים שאומנו:
          </span>
          <span className="text-xs font-bold font-mono tabular-nums">
            [{trainedCount}]
          </span>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-3">
          {/* Admin Dashboard Toggle - Strictly visible only for nach.vidan@gmail.com */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onTabChange(activeTab === 'training' ? 'dashboard' : 'training')}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold py-1 px-2.5 border transition-colors cursor-pointer rounded-none ${
                activeTab === 'dashboard'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 hover:border-slate-800 text-slate-800'
              }`}
            >
              {activeTab === 'dashboard' ? (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>חזרה לאימון</span>
                </>
              ) : (
                <>
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>דשבורד מנהל</span>
                </>
              )}
            </button>
          )}

          {/* Minimal Logout */}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors py-1 px-2 cursor-pointer rounded-none"
            title="התנתק"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>התנתק</span>
          </button>
        </div>
      </div>
    </header>
  );
};
