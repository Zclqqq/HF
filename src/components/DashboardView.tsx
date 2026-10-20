import React, { useEffect, useState, useRef } from 'react';
import { db } from '../services/db';
import {
  ArrowRight,
  Download,
  Upload,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  Filter,
  FileText,
  FileUp,
  HelpCircle,
} from 'lucide-react';

interface DashboardViewProps {
  currentUserEmail: string;
  onBackToTraining: () => void;
}

interface DashboardVote {
  id: string;
  prompt: string;
  chosen_response: 'A' | 'B';
  chosen_text: string;
  rejected_text: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_trust_score?: number;
  user_is_spam?: boolean;
  is_golden?: boolean;
  golden_passed?: boolean;
  is_trusted?: boolean;
  timestamp: string;
}

interface DashboardUser {
  id: string;
  email: string;
  name: string;
  trainedCount: number;
  trustScore: number;
  isSpam: boolean;
  goldenPassed: number;
  goldenTotal: number;
  fastClicksCount: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUserEmail,
  onBackToTraining,
}) => {
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [votes, setVotes] = useState<DashboardVote[]>([]);
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [trustedVotesCount, setTrustedVotesCount] = useState(0);
  const [spamFilteredCount, setSpamFilteredCount] = useState(0);
  const [poolTotalCount, setPoolTotalCount] = useState(21);
  const [uploadedCount, setUploadedCount] = useState(0);

  const [filterMode, setFilterMode] = useState<'all' | 'trusted' | 'spam'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    const result = await db.fetchAdminDashboard(currentUserEmail);
    if (result.success && result.data) {
      const data: any = result.data;
      setVotes(data.votes || []);
      setUsers(data.users || []);
      setTotalVotes(data.total_votes || (data.votes?.length || 0));
      setTrustedVotesCount(data.trusted_votes ?? (data.votes?.filter((v: any) => v.is_trusted !== false).length || 0));
      setSpamFilteredCount(data.spam_filtered_votes ?? (data.votes?.filter((v: any) => v.is_trusted === false).length || 0));
      if (data.pool_total) setPoolTotalCount(data.pool_total);
      if (data.uploaded_count) setUploadedCount(data.uploaded_count);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [currentUserEmail]);

  const handleDownload = async () => {
    setDownloading(true);
    setMessage(null);
    setErrorMessage(null);
    const result = await db.downloadDpoTrainingData(currentUserEmail);
    if (!result.success) {
      setErrorMessage(result.error || 'שגיאה בהורדת הקובץ');
    } else {
      setMessage('קובץ dpo_training_data.jsonl המסונן והמאומת הורד בהצלחה!');
      setTimeout(() => setMessage(null), 5000);
    }
    setDownloading(false);
  };

  // --- Admin Batch Upload Handler (JSONL and CSV) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || text.trim().length === 0) {
          setErrorMessage('הקובץ שהועלה ריק.');
          setUploading(false);
          return;
        }

        let parsedItems: any[] = [];
        const isJsonlOrJson = file.name.endsWith('.jsonl') || file.name.endsWith('.json');

        if (isJsonlOrJson) {
          // Parse JSONL (or JSON array)
          if (text.trim().startsWith('[')) {
            parsedItems = JSON.parse(text);
          } else {
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            parsedItems = lines.map((l) => JSON.parse(l));
          }
        } else {
          // Parse CSV
          const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
          if (lines.length < 2) {
            setErrorMessage('קובץ ה-CSV חייב לכלול שורת כותרות ולפחות שורת נתונים אחת.');
            setUploading(false);
            return;
          }

          const parseCsvLine = (line: string): string[] => {
            const cols: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
              } else if ((char === ',' || char === ';' || char === '\t') && !inQuotes) {
                cols.push(current.trim().replace(/^["']|["']$/g, ''));
                current = '';
              } else {
                current += char;
              }
            }
            cols.push(current.trim().replace(/^["']|["']$/g, ''));
            return cols;
          };

          const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
          for (let i = 1; i < lines.length; i++) {
            const vals = parseCsvLine(lines[i]);
            const row: any = {};
            headers.forEach((h, idx) => {
              row[h] = vals[idx] || '';
            });
            parsedItems.push(row);
          }
        }

        if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
          setErrorMessage('לא זוהו שורות תקינות בקובץ.');
          setUploading(false);
          return;
        }

        // Upload to backend
        const res = await db.uploadPromptsBatch(parsedItems);
        if (res.success) {
          setMessage(`המאגר עודכן בהצלחה! השאלות הקודמות נמחקו והוחלפו ב-${res.added_count} שאלות חדשות.`);
          if (fileInputRef.current) fileInputRef.current.value = '';
          await loadData();
        } else {
          setErrorMessage(res.error || 'שגיאה בהעלאת השאלות לשרת');
        }
      } catch (err: any) {
        setErrorMessage(`שגיאה בפענוח הקובץ: ${err.message || 'פורמט לא תקין'}`);
      } finally {
        setUploading(false);
      }
    };

    reader.onerror = () => {
      setErrorMessage('קריאת הקובץ נכשלה.');
      setUploading(false);
    };

    reader.readAsText(file, 'utf-8');
  };

  const downloadSampleJsonl = () => {
    const sample = [
      {
        prompt: 'איך לומר לבוס שאני אאחר בגלל פקק?',
        responseA: 'היי, יש פקק רציני בכביש ואאחר בכ-20 דקות. מעדכן מיד שאני מגיע למשרד!',
        responseB: 'שלום מנהל נכבד. הנני מודיע לך בזאת כי רכבי לכוד בעומס תנועה בלתי סביר, ועל כן הגעתי תתעכב.',
        isGolden: true,
        groundTruthChosen: 'A',
      },
      {
        prompt: 'איך לבקש מחבר לצוות להעיף מבט מהיר על מסמך?',
        responseA: 'היי תומר, יש מצב שאתה מעיף מבט זריז של שתי דקות על הסיכום לפני הפגישה? ממש יעזור לי.',
        responseB: 'שלום עמיתי. אבקשך לבצע סקירה יסודית ומיידית של המסמך המצורף טרם מועד ההיוועצות המתוכנן.',
        isGolden: false,
      },
    ]
      .map((item) => JSON.stringify(item))
      .join('\n');

    const blob = new Blob([sample], { type: 'application/x-ndjson;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_prompts.jsonl';
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const filteredVotes = votes.filter((v) => {
    if (filterMode === 'trusted') return v.is_trusted !== false;
    if (filterMode === 'spam') return v.is_trusted === false;
    return true;
  });

  return (
    <div className="w-full max-w-5xl mx-auto py-4 space-y-6">
      {/* Top Header & Navigation */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              לוח בקרה למנהל (Admin Dashboard)
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-xs text-emerald-700 font-semibold font-mono">
              {currentUserEmail}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            ניהול אימונים, הגנת ספאם והעלאת שאלות למאגר
          </h1>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Download Filtered DPO Button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer rounded-none disabled:opacity-50"
            title="מייצא רק הצבעות אמינות שעברו את סינון הספאם"
          >
            <Download className="w-4 h-4" />
            <span>הורד DPO מסונן (.jsonl)</span>
          </button>

          {/* Back to Training Button */}
          <button
            type="button"
            onClick={onBackToTraining}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 border border-slate-300 hover:border-slate-800 bg-white text-slate-800 text-xs font-semibold transition-colors cursor-pointer rounded-none"
          >
            <ArrowRight className="w-4 h-4" />
            <span>חזרה לאימון</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-emerald-900 text-white text-xs font-medium border border-emerald-900 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-emerald-200 hover:text-white cursor-pointer">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-900 text-white text-xs font-medium border border-rose-900 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-200 hover:text-white cursor-pointer">✕</button>
        </div>
      )}

      {/* ADMIN BATCH UPLOAD SECTION (גישה בלעדית למנהל nach.vidan@gmail.com) */}
      <div className="bg-white border-2 border-slate-900 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 text-white">
              <FileUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                ממשק העלאת שאלות למאגר (Admin Batch Upload)
                <span className="text-xs bg-slate-100 text-slate-800 px-2 py-0.5 font-mono font-normal">
                  גישת מנהל בלבד
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                העלאת קובץ JSONL או CSV מחליפה ומוחקת את השאלות הקודמות במאגר ומעדכנת את כל המאמנים
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowFormatGuide(!showFormatGuide)}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showFormatGuide ? 'הסתר מבנה קובץ נדרש' : 'הצג מבנה קובץ נדרש'}</span>
          </button>
        </div>

        {/* Format Guide Drawer */}
        {showFormatGuide && (
          <div className="mb-5 p-4 bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-3">
            <div className="font-semibold text-slate-900">
              מבנה קובץ נדרש להעלאה (תומך ב-JSONL או ב-CSV):
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
              <div className="p-3 bg-white border border-slate-200">
                <div className="font-bold text-slate-900 mb-1.5 font-sans">דוגמת שורה ב-JSONL:</div>
                <pre className="text-slate-800 whitespace-pre-wrap">
{`{"prompt": "איך לומר לבוס שאני אאחר?", "responseA": "היי, תקוע בפקק ואאחר ב-20 דק'.", "responseB": "שלום מנהל. רכבי לכוד בעומס תנועה.", "isGolden": true, "groundTruthChosen": "A"}`}
                </pre>
              </div>

              <div className="p-3 bg-white border border-slate-200">
                <div className="font-bold text-slate-900 mb-1.5 font-sans">דוגמת שורות ב-CSV:</div>
                <pre className="text-slate-800 whitespace-pre-wrap">
{`prompt,responseA,responseB,isGolden
"איך לסרב בנימוס?","היי, גמור היום ולא אוכל להגיע","אני דוחה את ההזמנה.",true`}
                </pre>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={downloadSampleJsonl}
                className="inline-flex items-center gap-1 text-xs text-slate-800 hover:text-slate-950 font-bold underline cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>הורד קובץ דוגמה (sample_prompts.jsonl)</span>
              </button>
            </div>
          </div>
        )}

        {/* Upload Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".jsonl,.json,.csv,text/csv,application/json"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            id="admin-file-picker"
          />

          <label
            htmlFor="admin-file-picker"
            className={`inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold tracking-wide transition-colors cursor-pointer rounded-none border border-slate-900 ${
              uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>{uploading ? 'מעבד ומעלה שאלות...' : 'בחר קובץ שאלות (JSONL או CSV)'}</span>
          </label>

          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
            <span>גודל מאגר פעיל כעת:</span>
            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5">
              {poolTotalCount} שאלות
            </span>
            {uploadedCount > 0 && (
              <span className="text-emerald-700 font-medium">
                (מתוכן {uploadedCount} הועלו ע״י האדמין)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Anti-Spam & Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5">
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            סה״כ הצבעות
          </span>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900">
            {totalVotes}
          </span>
        </div>

        <div className="bg-white border border-emerald-200 p-5 bg-emerald-50/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              הצבעות מאומתות לאימון
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-emerald-800">
            {trustedVotesCount}
          </span>
          <span className="block text-[11px] text-emerald-600 mt-1">
            נכנסות לקובץ ה-JSONL
          </span>
        </div>

        <div className="bg-white border border-rose-200 p-5 bg-rose-50/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
              סוננו עקב ספאם
            </span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-rose-800">
            {spamFilteredCount}
          </span>
          <span className="block text-[11px] text-rose-600 mt-1">
            מנופות אוטומטית מאימון
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              משתמשים רשומים
            </span>
            <button
              type="button"
              onClick={loadData}
              title="רענן נתונים"
              className="p-1 border border-slate-200 hover:border-slate-800 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer rounded-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900">
            {users.length}
          </span>
          <span className="block text-[11px] text-slate-400 mt-1 font-mono">
            80% דינמי · 20% שאלות מבחן
          </span>
        </div>
      </div>

      {/* Users Trust Score Summary Table */}
      {users.length > 0 && (
        <div className="bg-white border border-slate-200">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              ציוני אמינות משתמשים (User Trust Scores & Anti-Spam Status)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                <tr>
                  <th className="p-3">שם ואימייל</th>
                  <th className="p-3 text-center">פרומפטים שאומנו</th>
                  <th className="p-3 text-center">ציון אמינות (Trust Score)</th>
                  <th className="p-3 text-center">שאלות מבחן (Golden)</th>
                  <th className="p-3 text-center">סטטוס ספאם</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSpam = u.isSpam || u.trustScore < 60;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-800">
                        <div>{u.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800">
                        {u.trainedCount}
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span
                          className={`inline-block px-2 py-0.5 font-bold ${
                            u.trustScore >= 80
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                              : u.trustScore >= 60
                              ? 'text-amber-700 bg-amber-50 border border-amber-200'
                              : 'text-rose-700 bg-rose-50 border border-rose-200'
                          }`}
                        >
                          {u.trustScore}%
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">
                        {u.goldenTotal > 0 ? (
                          <span>{u.goldenPassed} / {u.goldenTotal} ({Math.round((u.goldenPassed / u.goldenTotal) * 100)}%)</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isSpam ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            <span>ספאמר (הצבעות מסוננות)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5">
                            <CheckCircle className="w-3 h-3" />
                            <span>מאמן אמין</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filterable Votes Table */}
      <div className="bg-white border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              פירוט כל השאלות שאומנו
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              ({filteredVotes.length} מוצגות)
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 border transition-colors cursor-pointer rounded-none ${
                filterMode === 'all'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              הכל ({votes.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('trusted')}
              className={`px-2.5 py-1 border transition-colors cursor-pointer rounded-none ${
                filterMode === 'trusted'
                  ? 'bg-emerald-800 border-emerald-800 text-white'
                  : 'bg-white border-slate-200 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              מאומתות לאימון ({trustedVotesCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('spam')}
              className={`px-2.5 py-1 border transition-colors cursor-pointer rounded-none ${
                filterMode === 'spam'
                  ? 'bg-rose-800 border-rose-800 text-white'
                  : 'bg-white border-slate-200 text-rose-700 hover:bg-rose-50'
              }`}
            >
              סוננו מספאם ({spamFilteredCount})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            טוען נתונים ממסד הנתונים...
          </div>
        ) : filteredVotes.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            לא נמצאו הצבעות בהתאם לסינון שנבחר.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredVotes.map((vote, idx) => {
              const isExpanded = expandedId === vote.id;
              const isTrusted = vote.is_trusted !== false;

              return (
                <div key={vote.id} className="hover:bg-slate-50/50 transition-colors">
                  <div
                    onClick={() => toggleExpand(vote.id)}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="space-y-1 grow max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono text-slate-400">#{idx + 1}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-800">
                          מאמן: {vote.user_name || vote.user_email}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-400 text-[11px]">
                          {new Date(vote.timestamp).toLocaleString('he-IL')}
                        </span>
                        {vote.is_golden && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 font-bold">
                            שאלת מבחן (Golden)
                          </span>
                        )}
                        {!isTrusted && (
                          <span className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0.5 font-bold">
                            סונן - לא נכנס ל-DPO
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                        {vote.prompt}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <div className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800">
                        נבחרה אפשרות {vote.chosen_response === 'A' ? 'א׳' : 'ב׳'}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Choice Comparison Detail */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-1 border-t border-slate-100 bg-slate-50/70">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                        <div className="p-3.5 bg-white border border-emerald-200">
                          <span className="block font-bold text-emerald-800 mb-1.5">
                            תשובה שנבחרה (אפשרות {vote.chosen_response === 'A' ? 'א׳' : 'ב׳'})
                          </span>
                          <p className="text-slate-900 font-sans leading-relaxed">
                            {vote.chosen_text}
                          </p>
                        </div>

                        <div className="p-3.5 bg-white border border-slate-200">
                          <span className="block font-bold text-slate-500 mb-1.5">
                            תשובה שנדחתה (אפשרות {vote.chosen_response === 'A' ? 'ב׳' : 'א׳'})
                          </span>
                          <p className="text-slate-600 font-sans leading-relaxed">
                            {vote.rejected_text}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
