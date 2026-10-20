import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { POOL_PROMPTS, PoolPrompt } from './src/data/prompts.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_EMAIL = 'nach.vidan@gmail.com';
const ADMIN_INITIAL_PASSWORD = '3546';

const app = express();
app.use(express.json({ limit: '10mb' }));

// --- Persistence Paths ---
const DB_FILE = path.resolve(__dirname, '.training_votes_db.json');
const USERS_FILE = path.resolve(__dirname, '.users_db.json');
const SESSIONS_FILE = path.resolve(__dirname, '.sessions_db.json');
const UPLOADED_PROMPTS_FILE = path.resolve(__dirname, '.uploaded_prompts.json');

// --- Types ---
interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  trainedCount: number;
  trustScore: number; // 0 - 100
  isSpam: boolean;
  goldenTotal: number;
  goldenPassed: number;
  fastClicksCount: number;
  consecutiveSameSideCount: number;
  lastChosenSide?: 'A' | 'B';
  createdAt: string;
  lastLoginAt: string;
}

interface StoredSession {
  token: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  expiresAt: string;
}

interface ServerVote {
  id: string;
  prompt_id: string;
  prompt: string;
  user_id: string;
  user_email: string;
  user_name: string;
  chosen_response: 'A' | 'B';
  chosen_text: string;
  rejected_text: string;
  category: string;
  timestamp: string;
  duration_ms: number;
  is_golden: boolean;
  golden_passed?: boolean;
  is_trusted: boolean;
  trust_score_at_vote: number;
}

// In-Memory Database Stores with Disk Mirroring
let serverUsers: Record<string, StoredUser> = {};
let serverSessions: Record<string, StoredSession> = {};
let serverVotes: ServerVote[] = [];

// Cryptographic Security Helpers
function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  try {
    const computedHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Ensure Admin account nach.vidan@gmail.com with password 3546 is pre-seeded
function seedAdminUser() {
  const adminId = `usr_${ADMIN_EMAIL.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(ADMIN_INITIAL_PASSWORD, salt);

  if (!serverUsers[adminId]) {
    serverUsers[adminId] = {
      id: adminId,
      email: ADMIN_EMAIL,
      name: 'נח וידן (מנהל מערכת)',
      passwordHash,
      salt,
      trainedCount: 0,
      trustScore: 100,
      isSpam: false,
      goldenTotal: 0,
      goldenPassed: 0,
      fastClicksCount: 0,
      consecutiveSameSideCount: 0,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
  } else {
    // Ensure admin password is reset to 3546
    serverUsers[adminId].passwordHash = passwordHash;
    serverUsers[adminId].salt = salt;
    serverUsers[adminId].trustScore = 100;
    serverUsers[adminId].isSpam = false;
  }
  persistUsers();
}

// Load persistent data from disk on boot
if (fs.existsSync(USERS_FILE)) {
  try {
    serverUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (err) {
    console.warn('Could not read existing users db, initializing empty store', err);
  }
}
seedAdminUser();

if (fs.existsSync(SESSIONS_FILE)) {
  try {
    serverSessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch (err) {
    console.warn('Could not read existing sessions db, initializing empty store', err);
  }
}

if (fs.existsSync(DB_FILE)) {
  try {
    serverVotes = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (err) {
    console.warn('Could not read existing votes db, initializing empty store', err);
  }
}

let uploadedPrompts: PoolPrompt[] = [];

if (fs.existsSync(UPLOADED_PROMPTS_FILE)) {
  try {
    uploadedPrompts = JSON.parse(fs.readFileSync(UPLOADED_PROMPTS_FILE, 'utf-8'));
  } catch (err) {
    console.warn('Could not read existing uploaded prompts db, initializing empty store', err);
  }
}

function persistUploadedPrompts() {
  try {
    fs.writeFileSync(UPLOADED_PROMPTS_FILE, JSON.stringify(uploadedPrompts, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write uploaded prompts to disk', err);
  }
}

function getActivePool(): PoolPrompt[] {
  if (uploadedPrompts.length > 0) {
    return uploadedPrompts;
  }
  return POOL_PROMPTS;
}

function persistUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(serverUsers, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write users to disk', err);
  }
}

function persistSessions() {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(serverSessions, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write sessions to disk', err);
  }
}

function persistVotes() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(serverVotes, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write votes to disk', err);
  }
}

function createSessionToken(user: StoredUser): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days

  serverSessions[token] = {
    token,
    userId: user.id,
    email: user.email,
    name: user.name,
    createdAt: now.toISOString(),
    expiresAt,
  };

  persistSessions();
  return token;
}

// --- Authentication Middleware ---
interface AuthenticatedRequest extends Request {
  user?: StoredUser;
  sessionToken?: string;
}

function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || (req.headers['x-auth-token'] as string);
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (token && serverSessions[token]) {
    const session = serverSessions[token];
    if (new Date(session.expiresAt) > new Date()) {
      req.user = serverUsers[session.userId];
      req.sessionToken = token;
    } else {
      delete serverSessions[token];
      persistSessions();
    }
  }

  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'משתמש לא מחובר, יש להתחבר מחדש' });
    return;
  }
  next();
}

app.use(authenticate);

// --- Public Endpoints ---

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    votes_count: serverVotes.length,
    users_count: Object.keys(serverUsers).length,
  });
});

// User Registration
app.post('/api/auth/register', (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password ? String(password).trim() : '';

  if (cleanPassword.length < 3) {
    res.status(400).json({ error: 'סיסמה חייבת להכיל לפחות 3 תווים' });
    return;
  }

  const userId = `usr_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

  if (serverUsers[userId]) {
    res.status(409).json({ error: 'משתמש עם כתובת אימייל זו כבר קיים במערכת, אנא התחבר' });
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(cleanPassword, salt);
  const userVotesCount = serverVotes.filter((v) => v.user_id === userId).length;

  const newUser: StoredUser = {
    id: userId,
    email: cleanEmail,
    name: (name && String(name).trim()) || cleanEmail.split('@')[0],
    passwordHash,
    salt,
    trainedCount: userVotesCount,
    trustScore: 100,
    isSpam: false,
    goldenTotal: 0,
    goldenPassed: 0,
    fastClicksCount: 0,
    consecutiveSameSideCount: 0,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  serverUsers[userId] = newUser;
  persistUsers();

  const token = createSessionToken(newUser);

  res.status(201).json({
    success: true,
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      trainedCount: newUser.trainedCount,
      trustScore: newUser.trustScore,
      role: newUser.email === ADMIN_EMAIL ? 'Admin & Lead Annotator (REALHF)' : 'Preference Annotator (REALHF)',
    },
  });
});

// User Login (Supports Admin nach.vidan@gmail.com with password 3546)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email) {
    res.status(400).json({ error: 'נא להזין כתובת אימייל' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password ? String(password).trim() : '';
  const userId = `usr_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const existing = serverUsers[userId];

  if (!existing) {
    res.status(404).json({ error: 'משתמש לא נמצא. אנא עבור ללשונית "הרשמה" כדי לפתוח חשבון' });
    return;
  }

  // Verify password securely
  if (existing.passwordHash && existing.salt) {
    const isMatch = verifyPassword(cleanPassword, existing.salt, existing.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'סיסמה שגויה, נסה שנית' });
      return;
    }
  }

  const userVotesCount = serverVotes.filter((v) => v.user_id === userId).length;
  existing.trainedCount = userVotesCount;
  existing.lastLoginAt = new Date().toISOString();
  persistUsers();

  const token = createSessionToken(existing);

  res.json({
    success: true,
    token,
    user: {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      trainedCount: existing.trainedCount,
      trustScore: existing.trustScore ?? 100,
      isSpam: existing.isSpam ?? false,
      role: existing.email === ADMIN_EMAIL ? 'Admin & Lead Annotator (REALHF)' : 'Preference Annotator (REALHF)',
    },
  });
});

// Current User Profile
app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'משתמש לא מחובר' });
    return;
  }

  const userVotesCount = serverVotes.filter((v) => v.user_id === req.user!.id).length;
  req.user.trainedCount = userVotesCount;

  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      trainedCount: userVotesCount,
      trustScore: req.user.trustScore ?? 100,
      isSpam: req.user.isSpam ?? false,
      role: req.user.email === ADMIN_EMAIL ? 'Admin & Lead Annotator (REALHF)' : 'Preference Annotator (REALHF)',
    },
  });
});

// Logout
app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
  if (req.sessionToken && serverSessions[req.sessionToken]) {
    delete serverSessions[req.sessionToken];
    persistSessions();
  }
  res.json({ success: true });
});

// --- Dynamic Question Pool & Perpetual Refresh (80% Dynamic / 20% Golden Questions) ---

app.get('/api/prompts/queue', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const userVotes = serverVotes.filter((v) => v.user_id === user.id);
  const seenPromptIds = new Set(userVotes.map((v) => v.prompt_id));

  const unseenPrompts = getActivePool().filter((p) => !seenPromptIds.has(p.id));
  const unseenGolden = unseenPrompts.filter((p) => p.isGolden);
  const unseenDynamic = unseenPrompts.filter((p) => !p.isGolden);

  // Build a personalized queue based on 80/20 hybrid distribution
  const queue: PoolPrompt[] = [];
  const dynamicPoolCopy = [...unseenDynamic];
  const goldenPoolCopy = [...unseenGolden];

  // Shuffle dynamic pool
  dynamicPoolCopy.sort(() => Math.random() - 0.5);
  goldenPoolCopy.sort(() => Math.random() - 0.5);

  let goldenIndex = 0;
  let dynamicIndex = 0;

  while (dynamicIndex < dynamicPoolCopy.length || goldenIndex < goldenPoolCopy.length) {
    // 20% chance of golden question, or if only golden left
    const shouldPickGolden = Math.random() < 0.2 && goldenIndex < goldenPoolCopy.length;

    if (shouldPickGolden && goldenIndex < goldenPoolCopy.length) {
      queue.push(goldenPoolCopy[goldenIndex++]);
    } else if (dynamicIndex < dynamicPoolCopy.length) {
      queue.push(dynamicPoolCopy[dynamicIndex++]);
    } else if (goldenIndex < goldenPoolCopy.length) {
      queue.push(goldenPoolCopy[goldenIndex++]);
    }
  }

  // Strip groundTruthChosen from client view so it remains covert
  const sanitizedQueue = queue.map((p) => ({
    id: p.id,
    category: p.category,
    categoryLabel: p.categoryLabel,
    title: p.title,
    prompt: p.prompt,
    focusAspect: p.focusAspect,
    responseA: p.responseA,
    responseB: p.responseB,
    // Note: isGolden and groundTruthChosen are NOT exposed to the client to ensure covert testing
  }));

  res.json({
    queue: sanitizedQueue,
    total_unseen: unseenPrompts.length,
    user_trained_count: userVotes.length,
    trust_score: user.trustScore ?? 100,
  });
});

// User Progress & Saved Work
app.get('/api/user/progress', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const userVotes = serverVotes.filter((v) => v.user_id === user.id);
  const votedPromptIds = Array.from(new Set(userVotes.map((v) => v.prompt_id)));

  res.json({
    user_id: user.id,
    trained_count: userVotes.length,
    trust_score: user.trustScore ?? 100,
    is_spam: user.isSpam ?? false,
    voted_prompt_ids: votedPromptIds,
    votes: userVotes,
  });
});

// --- Preference Voting with Anti-Spam & Trust Score Calculation ---
app.post('/api/votes', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { id, prompt_id, prompt, chosen_response, chosen_text, rejected_text, category, duration_ms } = req.body;

  if (!prompt_id || !chosen_response) {
    res.status(400).json({ error: 'חסרים פרטי הצבעה נדרשים' });
    return;
  }

  // Look up prompt in master pool
  const foundPrompt = getActivePool().find((p) => p.id === prompt_id);
  const promptContent = prompt || foundPrompt?.prompt || '';
  const isGolden = !!foundPrompt?.isGolden;
  let goldenPassed: boolean | undefined = undefined;

  // Initialize trust score if unset
  if (user.trustScore === undefined) user.trustScore = 100;
  if (user.goldenTotal === undefined) user.goldenTotal = 0;
  if (user.goldenPassed === undefined) user.goldenPassed = 0;
  if (user.fastClicksCount === undefined) user.fastClicksCount = 0;
  if (user.consecutiveSameSideCount === undefined) user.consecutiveSameSideCount = 0;

  // 1. Anti-Spam: Check submission latency (Reading Timer bypass or bot clicks)
  const clickDuration = duration_ms || 0;
  if (clickDuration > 0 && clickDuration < 1800) {
    user.fastClicksCount += 1;
    user.trustScore = Math.max(0, user.trustScore - 12);
  }

  // 2. Anti-Spam: Check blind clicking bias (clicking same side repeatedly)
  if (user.lastChosenSide === chosen_response) {
    user.consecutiveSameSideCount += 1;
    if (user.consecutiveSameSideCount >= 5) {
      user.trustScore = Math.max(0, user.trustScore - 15);
    }
  } else {
    user.consecutiveSameSideCount = 1;
    user.lastChosenSide = chosen_response;
  }

  // 3. Anti-Spam: Covert Golden Question check
  if (isGolden && foundPrompt?.groundTruthChosen) {
    user.goldenTotal += 1;
    goldenPassed = chosen_response === foundPrompt.groundTruthChosen;

    if (goldenPassed) {
      user.goldenPassed += 1;
      // Reward attentiveness
      user.trustScore = Math.min(100, user.trustScore + 5);
    } else {
      // Failed golden test: major penalty
      user.trustScore = Math.max(0, user.trustScore - 30);
    }
  }

  // 4. Update Spam Flag
  // If trust score < 60% or failed >= 2 golden questions with low accuracy
  if (user.trustScore < 60 || (user.goldenTotal >= 2 && user.goldenPassed / user.goldenTotal < 0.5)) {
    user.isSpam = true;
  } else if (user.trustScore >= 70 && (!user.goldenTotal || user.goldenPassed / user.goldenTotal >= 0.6)) {
    user.isSpam = false;
  }

  // Determine if this vote is trusted
  const isTrustedVote = !user.isSpam && user.trustScore >= 60;

  const newVote: ServerVote = {
    id: id || `vt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    prompt_id,
    prompt: promptContent,
    user_id: user.id,
    user_email: user.email,
    user_name: user.name,
    chosen_response,
    chosen_text: chosen_text || '',
    rejected_text: rejected_text || '',
    category: category || foundPrompt?.category || 'conversational_hebrew',
    timestamp: new Date().toISOString(),
    duration_ms: clickDuration,
    is_golden: isGolden,
    golden_passed: goldenPassed,
    is_trusted: isTrustedVote,
    trust_score_at_vote: user.trustScore,
  };

  const existingIdx = serverVotes.findIndex(
    (v) => v.id === newVote.id || (v.prompt_id === prompt_id && v.user_id === user.id)
  );
  if (existingIdx >= 0) {
    serverVotes[existingIdx] = newVote;
  } else {
    serverVotes.unshift(newVote);
  }

  persistVotes();

  const userTotal = serverVotes.filter((v) => v.user_id === user.id).length;
  user.trainedCount = userTotal;
  persistUsers();

  res.status(201).json({
    success: true,
    vote: newVote,
    user_total_trained: userTotal,
    trust_score: user.trustScore,
    is_trusted: isTrustedVote,
  });
});

// --- Admin Dashboard (Strictly nach.vidan@gmail.com) ---
app.get('/api/admin/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (user.email.toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'אין לך הרשאת מנהל לצפייה בלוח הבקרה' });
    return;
  }

  const promptMap = new Map<string, string>();
  getActivePool().forEach((p) => promptMap.set(p.id, p.prompt));

  // Enriched votes with user reliability info
  const enrichedVotes = serverVotes.map((v) => {
    const promptText = v.prompt || promptMap.get(v.prompt_id) || '';
    const u = serverUsers[v.user_id];
    return {
      id: v.id,
      prompt_id: v.prompt_id,
      prompt: promptText,
      chosen_response: v.chosen_response,
      chosen_text: v.chosen_text,
      rejected_text: v.rejected_text,
      user_id: v.user_id,
      user_name: u?.name || v.user_name || v.user_id.replace('usr_', ''),
      user_email: u?.email || v.user_email || `${v.user_id.replace('usr_', '')}@user`,
      user_trust_score: u?.trustScore ?? 100,
      user_is_spam: u?.isSpam ?? false,
      is_golden: v.is_golden ?? false,
      golden_passed: v.golden_passed,
      is_trusted: v.is_trusted ?? true,
      timestamp: v.timestamp,
    };
  });

  // Calculate high-level metrics
  const totalVotes = serverVotes.length;
  const trustedVotes = serverVotes.filter((v) => v.is_trusted !== false).length;
  const spamFilteredVotes = serverVotes.filter((v) => v.is_trusted === false).length;

  const usersList = Object.values(serverUsers).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    trainedCount: u.trainedCount,
    trustScore: u.trustScore ?? 100,
    isSpam: u.isSpam ?? false,
    goldenPassed: u.goldenPassed ?? 0,
    goldenTotal: u.goldenTotal ?? 0,
    fastClicksCount: u.fastClicksCount ?? 0,
    createdAt: u.createdAt,
  }));

  res.json({
    total_votes: totalVotes,
    trusted_votes: trustedVotes,
    spam_filtered_votes: spamFilteredVotes,
    users_count: Object.keys(serverUsers).length,
    users: usersList,
    votes: enrichedVotes,
    pool_total: getActivePool().length,
    uploaded_count: uploadedPrompts.length,
  });
});

// --- Admin Batch Upload (Strictly nach.vidan@gmail.com with Admin Password) ---
app.post('/api/admin/prompts/batch', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (user.email.toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'אין לך הרשאת מנהל להעלאת שאלות' });
    return;
  }

  const { prompts } = req.body;
  if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
    res.status(400).json({ error: 'לא התקבלו שאלות תקינות בקובץ' });
    return;
  }

  const newValidPrompts: PoolPrompt[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const raw = prompts[i];
    const promptText = (raw.prompt || '').trim();
    const responseA = (raw.responseA || raw.chosen || '').trim();
    const responseB = (raw.responseB || raw.rejected || '').trim();

    if (!promptText || !responseA || !responseB) {
      continue;
    }

    const isGolden = !!raw.isGolden || raw.is_golden === true || raw.is_golden === 'true';
    let groundTruthChosen: 'A' | 'B' | undefined = undefined;

    if (isGolden) {
      if (raw.groundTruthChosen === 'A' || raw.groundTruthChosen === 'B') {
        groundTruthChosen = raw.groundTruthChosen;
      } else if (raw.ground_truth === 'A' || raw.ground_truth === 'B') {
        groundTruthChosen = raw.ground_truth;
      } else if (raw.chosen) {
        // If uploaded with chosen/rejected, responseA is the ground-truth chosen
        groundTruthChosen = 'A';
      }
    }

    const poolItem: PoolPrompt = {
      id: raw.id || `up_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      category: raw.category || 'creative',
      categoryLabel: raw.categoryLabel || (isGolden ? 'מבחן אמינות' : 'שאלות מאגר'),
      title: raw.title || promptText.slice(0, 30),
      prompt: promptText,
      focusAspect: raw.focusAspect || 'עברית אנושית טבעית',
      responseA,
      responseB,
      isGolden,
      groundTruthChosen,
    };

    newValidPrompts.push(poolItem);
  }

  if (newValidPrompts.length === 0) {
    res.status(400).json({
      error: 'לא נמצאו שורות תקינות. הקובץ חייב לכלול שדות prompt, responseA, responseB (או chosen, rejected)',
    });
    return;
  }

  // Replace previous questions completely with the new batch
  uploadedPrompts = newValidPrompts;
  persistUploadedPrompts();

  const allPrompts = getActivePool();

  res.status(201).json({
    success: true,
    added_count: newValidPrompts.length,
    total_pool_count: allPrompts.length,
    uploaded_count: uploadedPrompts.length,
  });
});

// --- Export DPO Dataset (Clean & Spam Filtered for nach.vidan@gmail.com) ---
app.get('/api/export/dpo', (req: AuthenticatedRequest, res) => {
  const token = (req.query.token as string) || req.sessionToken;
  let authorized = false;

  if (req.user && req.user.email.toLowerCase() === ADMIN_EMAIL) {
    authorized = true;
  } else if (token && serverSessions[token]) {
    const session = serverSessions[token];
    if (session.email.toLowerCase() === ADMIN_EMAIL) {
      authorized = true;
    }
  }

  const queryEmail = (req.query.email as string)?.toLowerCase()?.trim();
  if (queryEmail === ADMIN_EMAIL && req.user?.email.toLowerCase() === ADMIN_EMAIL) {
    authorized = true;
  }

  if (!authorized) {
    res.status(403).json({ error: 'מורשה להורדה עבור nach.vidan@gmail.com בלבד' });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dpo_training_data.jsonl"');

  const promptMap = new Map<string, string>();
  getActivePool().forEach((p) => promptMap.set(p.id, p.prompt));

  // CRITICAL ANTI-SPAM RULE: Filter out spam votes! Only export trusted votes
  const trustedVotes = serverVotes.filter((v) => v.is_trusted !== false);

  let lines: string[] = [];

  if (trustedVotes.length > 0) {
    lines = trustedVotes.map((v) => {
      const promptText = v.prompt || promptMap.get(v.prompt_id) || '';
      return JSON.stringify({
        prompt: promptText,
        chosen: v.chosen_text || '',
        rejected: v.rejected_text || '',
      });
    });
  } else {
    // If no human votes yet, export default verified pairs from getActivePool()
    lines = getActivePool().map((p) =>
      JSON.stringify({
        prompt: p.prompt,
        chosen: p.responseA,
        rejected: p.responseB,
      })
    );
  }

  const fileContent = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  res.send(Buffer.from(fileContent, 'utf-8'));
});

// --- Vite Middleware Integration ---
async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[REALHF Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
