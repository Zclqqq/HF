import { INITIAL_PROMPTS } from '../data/prompts';
import { AnnotatorUser, SessionStats, TrainingPrompt, VoteRecord } from '../types';

const STORAGE_KEYS = {
  USER: 'realhf_user_session',
  TOKEN: 'realhf_auth_token',
  VOTES: 'realhf_votes_cache',
  SKIPS: 'realhf_skips_cache',
};

function safeParse<T>(jsonString: string | null, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.error('Failed to parse stored JSON', e);
    return fallback;
  }
}

class TrainingDBService {
  private prompts: TrainingPrompt[] = INITIAL_PROMPTS;

  public getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  }

  public setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  }

  public clearToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
  }

  public getCurrentUser(): AnnotatorUser | null {
    if (typeof window === 'undefined') return null;
    return safeParse<AnnotatorUser | null>(localStorage.getItem(STORAGE_KEYS.USER), null);
  }

  public setCurrentUser(user: AnnotatorUser | null): void {
    if (typeof window === 'undefined') return;
    if (user) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  }

  // --- Real Cryptographic Authentication & Server Sync ---

  public async checkAuth(): Promise<AnnotatorUser | null> {
    const token = this.getToken();
    if (!token) {
      return this.getCurrentUser();
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          const user: AnnotatorUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            avatarSeed: data.user.email,
            trainedCount: data.user.trainedCount || 0,
            skippedCount: 0,
          };
          this.setCurrentUser(user);
          return user;
        }
      } else if (res.status === 401) {
        // Token expired
        this.clearToken();
        this.setCurrentUser(null);
        return null;
      }
    } catch {
      // In offline mode, use cached user
    }

    return this.getCurrentUser();
  }

  public async register(
    email: string,
    name?: string,
    password?: string
  ): Promise<{ success: boolean; user?: AnnotatorUser; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name && name.trim()) || cleanEmail.split('@')[0];

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, name: cleanName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'שגיאה ביצירת המשתמש' };
      }

      if (data.token) {
        this.setToken(data.token);
      }

      const user: AnnotatorUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        avatarSeed: cleanEmail,
        trainedCount: data.user.trainedCount || 0,
        skippedCount: 0,
      };

      this.setCurrentUser(user);
      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err.message || 'שגיאת רשת בחיבור לשרת' };
    }
  }

  public async login(
    email: string,
    password?: string
  ): Promise<{ success: boolean; user?: AnnotatorUser; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'שגיאה בהתחברות למערכת' };
      }

      if (data.token) {
        this.setToken(data.token);
      }

      const user: AnnotatorUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        avatarSeed: cleanEmail,
        trainedCount: data.user.trainedCount || 0,
        skippedCount: 0,
      };

      this.setCurrentUser(user);

      // Load user's saved votes from server to sync local state
      await this.syncUserProgressFromServer(user.id);

      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err.message || 'שגיאת רשת בחיבור לשרת' };
    }
  }

  public async logout(): Promise<void> {
    const token = this.getToken();
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Silent
      }
    }
    this.clearToken();
    this.setCurrentUser(null);
  }

  // --- Prompts Queue & Work History ---

  public getAllPrompts(): TrainingPrompt[] {
    return this.prompts;
  }

  public async syncUserProgressFromServer(userId: string): Promise<string[]> {
    const token = this.getToken();
    if (!token) return [];

    try {
      const res = await fetch('/api/user/progress', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.votes && Array.isArray(data.votes)) {
          // Merge votes into local cache
          const localVotes = this.getAllVotes().filter((v) => v.user_id !== userId);
          const serverFormatted: VoteRecord[] = data.votes.map((v: any) => ({
            id: v.id,
            prompt_id: v.prompt_id,
            prompt_text: v.prompt,
            user_id: v.user_id,
            chosen_response: v.chosen_response,
            chosen_text: v.chosen_text,
            rejected_text: v.rejected_text,
            category: v.category || 'conversational_hebrew',
            timestamp: v.timestamp,
            duration_ms: v.duration_ms || 0,
          }));
          localStorage.setItem(STORAGE_KEYS.VOTES, JSON.stringify([...serverFormatted, ...localVotes]));
        }
        return data.voted_prompt_ids || [];
      }
    } catch {
      // offline
    }
    return [];
  }

  public async fetchActiveQueue(userId: string): Promise<TrainingPrompt[]> {
    const token = this.getToken();
    if (token) {
      try {
        const res = await fetch('/api/prompts/queue', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.queue && Array.isArray(data.queue) && data.queue.length > 0) {
            return data.queue;
          }
        }
      } catch {
        // Fallback to local queue calculation
      }
    }
    return this.getActiveQueue(userId);
  }

  public getActiveQueue(userId: string): TrainingPrompt[] {
    const allVotes = this.getAllVotes();
    const userVotedPromptIds = new Set(
      allVotes.filter((v) => v.user_id === userId).map((v) => v.prompt_id)
    );

    const skips = safeParse<string[]>(localStorage.getItem(STORAGE_KEYS.SKIPS), []);

    // Filter out already evaluated prompts
    const remaining = this.prompts.filter((p) => !userVotedPromptIds.has(p.id));

    // Sort so skipped prompts appear at the end
    return remaining.sort((a, b) => {
      const aSkipped = skips.includes(a.id);
      const bSkipped = skips.includes(b.id);
      if (aSkipped && !bSkipped) return 1;
      if (!aSkipped && bSkipped) return -1;
      return 0;
    });
  }

  public async logVote(params: {
    prompt: TrainingPrompt;
    userId: string;
    chosen: 'A' | 'B';
    durationMs?: number;
  }): Promise<{ record: VoteRecord; newCount: number }> {
    const { prompt, userId, chosen, durationMs = 0 } = params;

    const chosenText = chosen === 'A' ? prompt.responseA : prompt.responseB;
    const rejectedText = chosen === 'A' ? prompt.responseB : prompt.responseA;

    const voteRecord: VoteRecord = {
      id: `vt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      prompt_id: prompt.id,
      prompt_title: prompt.title || '',
      prompt_text: prompt.prompt,
      user_id: userId,
      chosen_response: chosen,
      chosen_text: chosenText,
      rejected_text: rejectedText,
      category: prompt.category,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
    };

    // 1. Update local cache
    const currentVotes = this.getAllVotes();
    const updatedVotes = [voteRecord, ...currentVotes.filter((v) => !(v.prompt_id === prompt.id && v.user_id === userId))];
    localStorage.setItem(STORAGE_KEYS.VOTES, JSON.stringify(updatedVotes));

    const userVotes = updatedVotes.filter((v) => v.user_id === userId);
    const newCount = userVotes.length;

    // 2. Update current user count in session
    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      currentUser.trainedCount = newCount;
      this.setCurrentUser(currentUser);
    }

    // 3. Remove from skips if skipped previously
    const skips = safeParse<string[]>(localStorage.getItem(STORAGE_KEYS.SKIPS), []);
    if (skips.includes(prompt.id)) {
      const updatedSkips = skips.filter((id) => id !== prompt.id);
      localStorage.setItem(STORAGE_KEYS.SKIPS, JSON.stringify(updatedSkips));
    }

    // 4. Background network sync to server database with Bearer token
    this.syncVoteToBackend(voteRecord);

    return { record: voteRecord, newCount };
  }

  public recordSkip(promptId: string, userId: string): void {
    const skips = safeParse<string[]>(localStorage.getItem(STORAGE_KEYS.SKIPS), []);
    if (!skips.includes(promptId)) {
      skips.push(promptId);
      localStorage.setItem(STORAGE_KEYS.SKIPS, JSON.stringify(skips));
    }

    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      currentUser.skippedCount = (currentUser.skippedCount || 0) + 1;
      this.setCurrentUser(currentUser);
    }
  }

  public getAllVotes(): VoteRecord[] {
    if (typeof window === 'undefined') return [];
    return safeParse<VoteRecord[]>(localStorage.getItem(STORAGE_KEYS.VOTES), []);
  }

  public resetUserSession(userId: string): void {
    const allVotes = this.getAllVotes().filter((v) => v.user_id !== userId);
    localStorage.setItem(STORAGE_KEYS.VOTES, JSON.stringify(allVotes));
    localStorage.removeItem(STORAGE_KEYS.SKIPS);

    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      currentUser.trainedCount = 0;
      currentUser.skippedCount = 0;
      this.setCurrentUser(currentUser);
    }
  }

  // --- Export DPO Dataset (Strictly for nach.vidan@gmail.com) ---

  public async downloadDpoTrainingData(userEmail: string): Promise<{ success: boolean; error?: string }> {
    if (userEmail.toLowerCase().trim() !== 'nach.vidan@gmail.com') {
      return { success: false, error: 'הורדת קובץ האימון מורשית עבור nach.vidan@gmail.com בלבד' };
    }

    const token = this.getToken();

    try {
      const url = token ? `/api/export/dpo?token=${encodeURIComponent(token)}` : `/api/export/dpo?email=${encodeURIComponent(userEmail)}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'dpo_training_data.jsonl';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        return { success: true };
      }
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || 'שגיאה בהורדת הקובץ מהשרת' };
    } catch (e: any) {
      console.warn('Backend export failed', e);
      return { success: false, error: 'תקלת רשת בעת הורדת קובץ ה-DPO' };
    }
  }

  // --- Admin Dashboard (Strictly for nach.vidan@gmail.com) ---

  public async fetchAdminDashboard(userEmail: string): Promise<{
    success: boolean;
    data?: {
      total_votes: number;
      users_count: number;
      votes: Array<{
        id: string;
        prompt: string;
        chosen_response: 'A' | 'B';
        chosen_text: string;
        rejected_text: string;
        user_id: string;
        user_name: string;
        user_email: string;
        timestamp: string;
      }>;
    };
    error?: string;
  }> {
    if (userEmail.toLowerCase().trim() !== 'nach.vidan@gmail.com') {
      return { success: false, error: 'אין לך הרשאה לצפות בלוח הבקרה' };
    }

    const token = this.getToken();

    try {
      const res = await fetch('/api/admin/dashboard', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, data };
      }
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'שגיאה בטעינת נתוני לוח הבקרה' };
    } catch {
      // Fallback: build from local storage
      const localVotes = this.getAllVotes();
      const promptMap = new Map<string, string>();
      this.prompts.forEach((p) => promptMap.set(p.id, p.prompt));

      return {
        success: true,
        data: {
          total_votes: localVotes.length,
          users_count: 1,
          votes: localVotes.map((v) => ({
            id: v.id,
            prompt: v.prompt_text || promptMap.get(v.prompt_id) || '',
            chosen_response: v.chosen_response,
            chosen_text: v.chosen_text,
            rejected_text: v.rejected_text,
            user_id: v.user_id,
            user_name: v.user_id.replace('usr_', ''),
            user_email: v.user_id.replace('usr_', '') + '@user',
            timestamp: v.timestamp,
          })),
        },
      };
    }
  }

  public async uploadPromptsBatch(prompts: any[]): Promise<{
    success: boolean;
    added_count?: number;
    total_pool_count?: number;
    error?: string;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'נדרשת התחברות כמנהל מערכת' };
    }

    try {
      const res = await fetch('/api/admin/prompts/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompts }),
      });

      const data = await res.json();
      if (res.ok) {
        return {
          success: true,
          added_count: data.added_count,
          total_pool_count: data.total_pool_count,
        };
      }
      return { success: false, error: data.error || 'שגיאה בהעלאת השאלות' };
    } catch (e: any) {
      return { success: false, error: e.message || 'תקלת רשת בעת העלאת השאלות' };
    }
  }

  private async syncVoteToBackend(vote: VoteRecord): Promise<void> {
    const token = this.getToken();
    try {
      await fetch('/api/votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...vote,
          prompt: vote.prompt_text,
        }),
      });
    } catch {
      // Offline fallback: already in local cache
    }
  }
}

export const db = new TrainingDBService();
