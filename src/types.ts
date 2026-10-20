export type PromptCategory = 'coding' | 'reasoning' | 'creative' | 'instruction';

export interface TrainingPrompt {
  id: string;
  category: PromptCategory;
  categoryLabel: string;
  title: string;
  prompt: string;
  responseA: string;
  responseB: string;
  focusAspect: string;
  metadata?: {
    modelA?: string;
    modelB?: string;
    temperature?: number;
  };
}

export interface VoteRecord {
  id: string;
  prompt_id: string;
  user_id: string;
  prompt_title?: string;
  prompt_text: string;
  chosen_response: 'A' | 'B';
  chosen_text: string;
  rejected_text: string;
  category: PromptCategory;
  timestamp: string;
  duration_ms: number;
}

export interface AnnotatorUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarSeed: string;
  trainedCount: number;
  skippedCount: number;
}

export interface SessionStats {
  totalTrained: number;
  totalSkipped: number;
  currentStreak: number;
  recentVotes: VoteRecord[];
}
