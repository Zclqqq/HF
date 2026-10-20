import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from './services/db';
import { AnnotatorUser, TrainingPrompt } from './types';
import { AuthScreen } from './components/AuthScreen';
import { TopBar } from './components/TopBar';
import { TrainingCard } from './components/TrainingCard';
import { QueueCompleteView } from './components/QueueCompleteView';
import { DashboardView } from './components/DashboardView';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AnnotatorUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<'training' | 'dashboard'>('training');

  const [queue, setQueue] = useState<TrainingPrompt[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<TrainingPrompt | null>(null);
  const [totalTrained, setTotalTrained] = useState<number>(0);
  const [justIncremented, setJustIncremented] = useState<boolean>(false);

  // Double-click protection & action feedback state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | null>(null);

  const promptStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    async function initAuth() {
      const user = await db.checkAuth();
      if (user) {
        setCurrentUser(user);
        await loadUserQueue(user);
      }
      setAuthChecked(true);
    }
    initAuth();
  }, []);

  const loadUserQueue = useCallback(async (user: AnnotatorUser) => {
    await db.syncUserProgressFromServer(user.id);
    const activeQueue = await db.fetchActiveQueue(user.id);
    const votes = db.getAllVotes().filter((v) => v.user_id === user.id);
    
    setQueue(activeQueue);
    setTotalTrained(votes.length);

    if (activeQueue.length > 0) {
      setCurrentPrompt(activeQueue[0]);
      promptStartTimeRef.current = Date.now();
    } else {
      setCurrentPrompt(null);
    }
  }, []);

  const handleLoginSuccess = async (user: AnnotatorUser) => {
    setCurrentUser(user);
    setActiveTab('training');
    await loadUserQueue(user);
  };

  const handleLogout = async () => {
    await db.logout();
    setCurrentUser(null);
    setCurrentPrompt(null);
    setQueue([]);
    setActiveTab('training');
  };

  const handleChooseOption = (option: 'A' | 'B') => {
    if (isSubmitting || !currentPrompt || !currentUser) {
      return;
    }

    const durationMs = Math.max(100, Date.now() - promptStartTimeRef.current);
    const promptToLog = currentPrompt;

    // Double-click protection: lock buttons immediately
    setIsSubmitting(true);
    setSelectedOption(option);

    // Instant local optimistic counter bump
    setTotalTrained((prev) => prev + 1);
    setJustIncremented(true);
    setTimeout(() => setJustIncremented(false), 400);

    // Instant non-blocking background database persistence (Zero UI lag)
    db.logVote({
      prompt: promptToLog,
      userId: currentUser.id,
      chosen: option,
      durationMs,
    }).catch((err) => {
      console.error('Failed to log vote in background', err);
    });

    // Instant seamless prompt rotation (Zero Lag)
    setTimeout(() => {
      setQueue((prevQueue) => {
        const remaining = prevQueue.filter((p) => p.id !== promptToLog.id);
        if (remaining.length > 0) {
          setCurrentPrompt(remaining[0]);
          promptStartTimeRef.current = Date.now();
        } else {
          setCurrentPrompt(null);
        }
        return remaining;
      });

      setIsSubmitting(false);
      setSelectedOption(null);
    }, 100);
  };

  const handleSkipPrompt = () => {
    if (isSubmitting || !currentPrompt || !currentUser) return;

    setIsSubmitting(true);
    const skippedPrompt = currentPrompt;
    db.recordSkip(skippedPrompt.id, currentUser.id);

    setTimeout(() => {
      setQueue((prevQueue) => {
        const withoutCurrent = prevQueue.filter((p) => p.id !== skippedPrompt.id);
        const rotatedQueue = [...withoutCurrent, skippedPrompt];
        
        if (rotatedQueue.length > 0) {
          setCurrentPrompt(rotatedQueue[0]);
          promptStartTimeRef.current = Date.now();
        }
        return rotatedQueue;
      });

      setIsSubmitting(false);
    }, 150);
  };

  const handleResetQueue = () => {
    if (!currentUser) return;
    db.resetUserSession(currentUser.id);
    loadUserQueue(currentUser);
  };

  if (!authChecked) {
    return null;
  }

  // Authentication State Check: redirects to login if unauthenticated
  if (!currentUser) {
    return <AuthScreen onSuccess={handleLoginSuccess} defaultEmail="nach.vidan@gmail.com" />;
  }

  const isAdmin = currentUser.email.toLowerCase().trim() === 'nach.vidan@gmail.com';

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 flex flex-col font-sans">
      {/* Top Bar (Contribution Counter, Admin Dashboard Link, Logout) */}
      <TopBar
        user={currentUser}
        trainedCount={totalTrained}
        isJustIncremented={justIncremented}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
      />

      {/* Main Core Viewport */}
      <main className="grow flex flex-col justify-center max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {isAdmin && activeTab === 'dashboard' ? (
          /* Admin Dashboard: Questions trained and by which users + DPO Download */
          <DashboardView
            currentUserEmail={currentUser.email}
            onBackToTraining={() => setActiveTab('training')}
          />
        ) : currentPrompt ? (
          /* Training Card */
          <TrainingCard
            prompt={currentPrompt}
            isSubmitting={isSubmitting}
            selectedOption={selectedOption}
            onChooseOption={handleChooseOption}
            onSkipPrompt={handleSkipPrompt}
          />
        ) : (
          /* Queue Completed View */
          <QueueCompleteView
            totalTrained={totalTrained}
            isAdmin={isAdmin}
            onGoToDashboard={() => setActiveTab('dashboard')}
            onResetQueue={handleResetQueue}
          />
        )}
      </main>
    </div>
  );
}
