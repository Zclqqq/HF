# Minimalist AI Preference Training Platform (RLHF / DPO)

A streamlined, zero-distraction micro-task interface engineered for human preference rating (RLHF / DPO), allowing authenticated annotators to evaluate AI-generated response pairs with zero page reload latency.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and design parameters were confirmed during Phase 1 clarification:
> - **Visual Theme**: Crisp clean paper-white minimalist theme (`#FAFAFA` background, `#FFFFFF` cards, `#E5E7EB` hairline borders, deep ink `#111827` typography).
> - **Input Paradigm**: Mouse and tap clicks only (focused button controls with debounce and double-click lock).
> - **Initial Prompt Dataset**: Diverse high-quality queue spanning coding challenges, logical reasoning, creative writing, and multi-turn instruction following.

---

## 1. Overview & Core Concept

- **What It Does**: Presents human evaluators with a prompt and two candidate model responses (Option A and Option B). With a single deliberate click, the evaluator selects the preferred response, immediately persisting the pair (`prompt_id`, `chosen_response`, `rejected_response`, `user_id`, timestamp) and rotating directly to the next task in the queue.
- **Target Audience / Persona**: AI Alignment researchers, RLHF/DPO data trainers, and model evaluation annotators who require high throughput, zero clutter, and fatigue-free rating sessions.
- **Key Value**: Microsecond perceived latency, distraction-free typography, rock-solid double-click protection, and exportable DPO-ready dataset generation.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Authentication Gate**:
   - Evaluator visits the app. If unauthenticated, a clean authentication screen welcomes the user to enter their annotator name or ID.
   - Once authenticated, the session persists and immediately transitions to the active prompt queue.
2. **Preference Evaluation View**:
   - **Top Bar**: Minimalist header showing brand wordmark, authenticated evaluator ID, and a prominent real-time counter: `Total Prompts Trained: [X]`.
   - **Prompt Card**: Clean, legible container displaying the instruction/query given to the model, with subtle category metadata (`Coding · Reasoning · Creative`).
   - **Side-by-Side Response Comparison (Option A vs. Option B)**:
     - Equal-width cards styled with crisp paper-white background, subtle hairline border, and syntax/prose formatting.
     - Direct action buttons on each card: `[ Choose Option A ]` and `[ Choose Option B ]` with clear hover and active states.
   - **Secondary Controls**: A discreet text button `[ Skip Prompt ]` for prompts that are ambiguous, invalid, or impossible to judge.
3. **Instant State Update & Queue Rotation**:
   - Clicking either option triggers an immediate local state bump on the `Total Prompts Trained` counter.
   - Action buttons lock briefly (300ms) with visual confirmation to eliminate double-clicks or accidental double-submissions.
   - The interface smoothly transitions to the next prompt in the queue without any page refresh.
4. **Completion & Review State**:
   - When the active queue is exhausted, a clean milestone screen summarizes completed evaluations with an option to download the DPO dataset JSONL or load another batch.

### Visual Identity & Theme
- **Aesthetic Direction**: High-end minimalist laboratory / research notebook aesthetic. Zero extraneous shadows, zero decorative neon, zero candy pill badges.
- **Color Palette**:
  - Dominant Canvas: Crisp paper-white (`#FBFBFB` / `#F8FAFC`)
  - Structural Cards: Pure white (`#FFFFFF`) with 1px neutral border (`#E2E8F0`)
  - Primary Typography: Deep slate/ink (`#0F172A`)
  - Secondary Metadata: Muted stone (`#64748B`)
  - Action Buttons: High-intent solid dark slate (`#0F172A`) with high-contrast white text, subtle hover lift (`#1E293B`)
  - Option Highlights: Option A (`#2563EB` subtle accent) & Option B (`#7C3AED` subtle accent)
- **Typography & Tabular Discipline**:
  - Font: Clean geometric sans (`Plus Jakarta Sans`) paired with monospace (`JetBrains Mono` / `font-mono`) for code snippets and prompts.
  - Tabular Numerals: `font-mono tabular-nums` applied to the contribution counter to prevent layout shift during rapid increments.
- **Motion & Latency**:
  - Micro-transitions ($\le 150\text{ms}$) for button press feedback and card rotation.
  - Immediate local optimistic UI update paired with background async API submission.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Optimistic State Updates with Debounced Double-Click Lock**
  - *Chosen Approach*: On click, immediately increment the counter in React state and trigger queue rotation while the network request commits to `/api/votes`. Buttons are locked for 350ms to strictly prevent double-clicks.
  - *Why*: Eliminates rating fatigue and waiting latency while ensuring idempotent database writes.
  - *Alternatives Considered*: Blocking UI until network round-trip completes (causes noticeable sluggishness and annotator frustration).

- **Decision 2: Server-Side Persistence with Exportable DPO/RLHF Format**
  - *Chosen Approach*: Express backend endpoints (`GET /api/prompts/queue`, `POST /api/votes`, `GET /api/stats/user/:id`, `GET /api/export/dpo`) storing records with `prompt_id`, `chosen_response`, `rejected_response`, `user_id`, `category`, and `timestamp`.
  - *Why*: Satisfies all functional specifications, works natively in the sandbox without requiring external cloud project credentials, and enables standard HuggingFace/TRL DPO dataset export.

- **Decision 3: Authentication Gate with Switchable Profiles**
  - *Chosen Approach*: Modal/view gate verifying annotator identity. Unauthenticated users cannot view prompts or log votes. Allows quick sign-out and profile switching to test multiple evaluator accounts.
  - *Why*: Strict compliance with functional specification while keeping the login friction minimal for reviewers.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                       Browser Client (React 19)                 │
│                                                                 │
│  ┌───────────────────────── Top Bar ──────────────────────────┐ │
│  │ Brand: RLHF Lab · Total Prompts Trained: [ 42 ] · User: Alice│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────── Prompt Box ────────────────────────┐ │
│  │ "Write a Python function to compute the Levenshtein dist"  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────┐               ┌──────────────────┐        │
│  │     Option A     │               │     Option B     │        │
│  │ [Model Output A] │               │ [Model Output B] │        │
│  │                  │               │                  │        │
│  │[ Choose Option A]│               │[ Choose Option B]│        │
│  └──────────────────┘               └──────────────────┘        │
│                     [ Skip Prompt ]                             │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Optimistic POST /api/votes
                                 │ GET /api/prompts/queue
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Backend (/server.ts)                 │
│                                                                 │
│  - GET  /api/auth/me            - Validate active user session  │
│  - POST /api/auth/login         - Annotator sign-in             │
│  - GET  /api/prompts/queue      - Fetch remaining prompts       │
│  - POST /api/votes              - Atomic vote commit            │
│  - GET  /api/stats/user/:id     - Aggregate personal stats      │
│  - GET  /api/export/dpo         - Export DPO JSONL format       │
│                                                                 │
│  Storage: Persistent JSON / In-memory data store with recovery  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Models

```typescript
interface TrainingPrompt {
  id: string;
  category: 'coding' | 'reasoning' | 'creative' | 'instruction';
  prompt: string;
  responseA: string;
  responseB: string;
  metadata?: {
    modelA?: string;
    modelB?: string;
    temperature?: number;
  };
}

interface VoteRecord {
  id: string;
  prompt_id: string;
  user_id: string;
  chosen_response: 'A' | 'B';
  chosen_text: string;
  rejected_text: string;
  category: string;
  timestamp: string;
  duration_ms: number;
}

interface AnnotatorStats {
  user_id: string;
  total_trained: number;
  total_skipped: number;
  streak: number;
  history: VoteRecord[];
}
```

### Interactive Component & State Mapping
- `AuthGuard`: Checks current user authentication; renders clean sign-in screen if unauthenticated, transitions smoothly to the evaluation interface once signed in.
- `TopBar`: Renders `Total Prompts Trained: [X]` with `tabular-nums` and a subtle pulse on increment, plus user ID and sign-out link.
- `PromptCard`: Displays prompt text with clean category separator (e.g. `System · Python · Dynamic Programming`).
- `ComparisonDeck`: Renders Option A and Option B with formatted text/code blocks, hover focus, and action buttons.
- `VoteHandler`: Debounced click handler that disables both buttons for 350ms, fires optimistic state update, records latency, triggers next task, and persists vote payload via API.
- `SkipHandler`: Marks prompt as skipped in current session and fetches next task instantly.
