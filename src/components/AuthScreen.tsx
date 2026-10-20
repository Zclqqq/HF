import React, { useState } from 'react';
import { db } from '../services/db';
import { AnnotatorUser } from '../types';
import { Loader2, UserPlus, LogIn, CheckSquare, Square } from 'lucide-react';

interface AuthScreenProps {
  onSuccess: (user: AnnotatorUser) => void;
  defaultEmail?: string;
}

const getSavedCreds = (defaultEmail: string) => {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('realhf_saved_creds');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.email) {
          return {
            email: parsed.email,
            password: parsed.password || '',
            remember: true,
          };
        }
      }
    } catch {
      // ignore
    }
  }
  return {
    email: defaultEmail,
    password: defaultEmail === 'nach.vidan@gmail.com' ? '3546' : '',
    remember: true,
  };
};

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onSuccess,
  defaultEmail = 'nach.vidan@gmail.com',
}) => {
  const initial = getSavedCreds(defaultEmail);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(initial.email);
  const [name, setName] = useState('');
  const [password, setPassword] = useState(initial.password);
  const [rememberMe, setRememberMe] = useState(initial.remember);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('נא להזין כתובת אימייל תקינה');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'register') {
        const result = await db.register(cleanEmail, name.trim(), password.trim());
        if (result.success && result.user) {
          if (rememberMe) {
            localStorage.setItem(
              'realhf_saved_creds',
              JSON.stringify({ email: cleanEmail, password: password.trim() })
            );
          } else {
            localStorage.removeItem('realhf_saved_creds');
          }
          onSuccess(result.user);
        } else {
          setError(result.error || 'שגיאה ביצירת המשתמש');
        }
      } else {
        const result = await db.login(cleanEmail, password.trim());
        if (result.success && result.user) {
          if (rememberMe) {
            localStorage.setItem(
              'realhf_saved_creds',
              JSON.stringify({ email: cleanEmail, password: password.trim() })
            );
          } else {
            localStorage.removeItem('realhf_saved_creds');
          }
          onSuccess(result.user);
        } else {
          setError(result.error || 'שגיאה בהתחברות');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'אירעה שגיאה בלתי צפויה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Top Site Name */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-widest text-slate-900 font-mono mb-2.5">
            REALHF
          </h1>
          {/* 1-Line Natural Language Description */}
          <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
            פלטפורמה לאימון מודלי בינה מלאכותית על ידי בחירת התשובה הטבעית והמדויקת ביותר.
          </p>
        </div>

        {/* Auth Box (Strict Sharp Non-Rounded Design) */}
        <div className="w-full bg-white border border-slate-200 p-6 sm:p-8 shadow-xs">
          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 border border-slate-200 mb-6 bg-slate-50">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2.5 text-xs font-semibold tracking-wider transition-colors cursor-pointer rounded-none ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              התחברות
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2.5 text-xs font-semibold tracking-wider transition-colors cursor-pointer rounded-none ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              יצירת משתמש חדש
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  שם מלא או כינוי מאמן (אופציונלי)
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ישראל ישראלי"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 rounded-none"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                כתובת אימייל
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 rounded-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  סיסמה
                </label>
                {mode === 'register' && (
                  <span className="text-[11px] text-slate-400">
                    לשמירה מאובטחת של ההתקדמות
                  </span>
                )}
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 rounded-none"
              />
            </div>

            {/* Remember Me Checkbox */}
            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded-none border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                />
                <span className="text-xs text-slate-700 font-medium">
                  שמור את המשתמש והסיסמה לכניסה הבאה
                </span>
              </label>
            </div>

            {error && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-none">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 rounded-none"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>מעבד בקשה...</span>
                </>
              ) : mode === 'register' ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>צור משתמש והתחל לאמן</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>התחבר למערכת</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Info */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <span className="text-xs text-slate-400">
              כל משתמש שומר את נתוני האימון והפרומפטים שלו בנפרד במסד הנתונים.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
