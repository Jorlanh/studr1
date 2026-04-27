import React, { createContext, useContext, useState, useRef, useEffect, useCallback, PropsWithChildren } from 'react';
import { AreaOfKnowledge, Question, AppView } from '../types';
import { generateQuestionBatch } from '../services/aiClientService';
import { apiRequest } from '../services/apiService';
import { useNavigation } from './NavigationContext';
import { useUI } from './UIContext';
import { useGamification } from './GamificationContext';
import { useUser } from './UserContext';
import { useTimer, formatTime } from '../hooks/useTimer';

const FULL_EXAM_DURATION = 19800;  // 5h 30m in seconds
const AREA_EXAM_DURATION = 5400;   // 1h 30m in seconds

interface MockContextValue {
  questions: Question[];
  userAnswers: Record<string, number>;
  currentQuestionIndex: number;
  simuladoMode: 'FULL' | 'AREA' | null;
  simuladoTargetCount: number;
  simuladoTargetArea: AreaOfKnowledge | null;
  currentExamId: string | null;
  lastExamScore: number | undefined;
  lastExamBand: string | undefined;
  timeRemaining: number;
  isTimeUp: boolean;
  loading: boolean;
  startSimulado: (mode: 'FULL' | 'AREA', targetArea?: AreaOfKnowledge) => Promise<void>;
  handleAnswerSelect: (optionIndex: number) => void;
  handleNext: () => Promise<void>;
  handlePrevious: () => void;
  cancelMock: () => void;
  retryFetchNext: () => Promise<void>;
  finalizeWithPartial: () => void;
  formatTime: (seconds: number) => string;
  examDuration: number;
}

const MockContext = createContext<MockContextValue | null>(null);

const DIFFICULTY_KEY: Record<string, string> = {
  'Fácil': 'EASY', 'Média': 'MEDIUM', 'Difícil': 'HARD',
};

export function MockProvider({ children }: PropsWithChildren) {
  const { navigate, view } = useNavigation();
  const { openPricing, openFetchError, closeFetchError, setFetchErrorRetrying } = useUI();
  const { fireGamificationEvent } = useGamification();
  const { user } = useUser();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [simuladoMode, setSimuladoMode] = useState<'FULL' | 'AREA' | null>(null);
  const [simuladoTargetCount, setSimuladoTargetCount] = useState(0);
  const [simuladoTargetArea, setSimuladoTargetArea] = useState<AreaOfKnowledge | null>(null);
  const [currentExamId, setCurrentExamId] = useState<string | null>(null);
  const [lastExamScore, setLastExamScore] = useState<number | undefined>(undefined);
  const [lastExamBand, setLastExamBand] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const isFetchingRef = useRef(false);
  const fetchPromiseRef = useRef<Promise<number> | null>(null);
  const simuladoModeRef = useRef(simuladoMode);
  const simuladoTargetAreaRef = useRef(simuladoTargetArea);
  const simuladoTargetCountRef = useRef(simuladoTargetCount);
  const currentExamIdRef = useRef(currentExamId);

  // Keep refs in sync for use inside timer callback
  useEffect(() => { simuladoModeRef.current = simuladoMode; }, [simuladoMode]);
  useEffect(() => { simuladoTargetAreaRef.current = simuladoTargetArea; }, [simuladoTargetArea]);
  useEffect(() => { simuladoTargetCountRef.current = simuladoTargetCount; }, [simuladoTargetCount]);
  useEffect(() => { currentExamIdRef.current = currentExamId; }, [currentExamId]);

  const handleTimeUp = useCallback(() => {
    // Time's up — finalize from the ref values
  }, []);

  const { timeRemaining, isTimeUp, startTimer, stopTimer, resetTimer } = useTimer(handleTimeUp);

  const getAreaForIndex = useCallback((index: number): AreaOfKnowledge => {
    if (simuladoModeRef.current === 'AREA' && simuladoTargetAreaRef.current) {
      return simuladoTargetAreaRef.current;
    }
    if (index < 45) return AreaOfKnowledge.HUMANAS;
    if (index < 90) return AreaOfKnowledge.LINGUAGENS;
    if (index < 135) return AreaOfKnowledge.NATUREZA;
    return AreaOfKnowledge.MATEMATICA;
  }, []);

  const fetchBatchWithRetry = useCallback(async (
    area: AreaOfKnowledge,
    count: number,
    excludeTopics: string[],
    examId?: string,
    maxAttempts: number = 3,
  ): Promise<Question[]> => {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await generateQuestionBatch(area, count, undefined, excludeTopics, false, true, examId);
      } catch (e: any) {
        lastErr = e;
        if (attempt < maxAttempts) {
          const backoff = 2000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }
    throw lastErr;
  }, []);

  // Background fetch for simulado
  useEffect(() => {
    if (view === AppView.MOCK_EXAM) {
      loadMoreInBackground();
    }
  }, [currentQuestionIndex, questions.length, view]);

  const loadMoreInBackground = useCallback((): Promise<number> => {
    // If already fetching, return the in-progress promise so callers can await it
    if (isFetchingRef.current && fetchPromiseRef.current) return fetchPromiseRef.current;
    const targetCount = simuladoTargetCountRef.current;
    const needsMore = (questions.length - currentQuestionIndex) <= 10;
    const isBelowCap = questions.length < targetCount;

    if (!needsMore || !isBelowCap) return Promise.resolve(0);

    const nextIndex = questions.length;
    const areaToFetch = getAreaForIndex(nextIndex);
    const countToFetch = Math.min(10, targetCount - questions.length);
    if (countToFetch <= 0) return Promise.resolve(0);

    isFetchingRef.current = true;
    if (questions.length === 0) setLoading(true);
    const promise = (async () => {
      try {
        const currentSubjects = questions.map(q => q.subject).filter(Boolean) as string[];
        const excludeTopics = Array.from(new Set(currentSubjects)).slice(-10);
        const newBatch = await fetchBatchWithRetry(areaToFetch, countToFetch, excludeTopics, currentExamIdRef.current ?? undefined);
        setQuestions(prev => [...prev, ...newBatch]);
        return newBatch.length;
      } catch {
        console.error('[Simulado] background fetch failed after retries');
        return 0;
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
        fetchPromiseRef.current = null;
      }
    })();
    fetchPromiseRef.current = promise;
    return promise;
  }, [questions, currentQuestionIndex, getAreaForIndex, fetchBatchWithRetry]);

  const finalizeSimulado = useCallback(async (questionsToScore: Question[]) => {
    stopTimer();

    const responses = questionsToScore.map((q, i) => ({
      questionId: q.id,
      orderIndex: i,
      difficulty: DIFFICULTY_KEY[q.difficulty] || 'MEDIUM',
      correct: userAnswers[q.id] === q.correctIndex,
      userAnswer: userAnswers[q.id] ?? null,
    }));

    let finalScore = 300;
    let finalBand = 'Insuficiente';

    try {
      const examId = currentExamIdRef.current;
      if (examId) {
        const result = await apiRequest(`/exams/${examId}/finalize`, 'POST', { responses });
        finalScore = result.score ?? 300;
        finalBand = result.band ?? 'Insuficiente';
      }
    } catch (err) {
      console.error('[finalizeSimulado] Erro ao calcular nota no servidor:', err);
    }

    setLastExamScore(finalScore);
    setLastExamBand(finalBand);

    if (user?.id) {
      localStorage.setItem(`studr_last_mock_${user.id}`, new Date().toISOString());
    }

    fireGamificationEvent('FINISH_MOCK', {
      mockType: simuladoModeRef.current === 'FULL' ? 'MOCK_FULL' : 'MOCK_AREA',
      score: finalScore,
    });

    if (questionsToScore.length !== questions.length) {
      setQuestions(questionsToScore);
    }

    navigate(AppView.RESULTS);
  }, [userAnswers, questions.length, user?.id, fireGamificationEvent, navigate, stopTimer]);

  const startSimulado = useCallback(async (mode: 'FULL' | 'AREA', targetArea?: AreaOfKnowledge) => {
    if (isFetchingRef.current) return;
    setLoading(true);
    isFetchingRef.current = true;

    setSimuladoMode(mode);
    setSimuladoTargetArea(targetArea || null);
    const targetCount = mode === 'FULL' ? 180 : 45;
    setSimuladoTargetCount(targetCount);

    // Server-side plan check + create Exam record
    let examId: string | null = null;
    try {
      const startResult = await apiRequest('/mock/start', 'POST', { mode, area: targetArea || null });
      examId = startResult.examId ?? null;
      setCurrentExamId(examId);
    } catch (e: any) {
      setLoading(false);
      isFetchingRef.current = false;
      if (e?.status === 403) {
        const msgs: Record<string, string> = {
          TRIAL_EXPIRED: 'Seu período de trial expirou. Assine o Premium para continuar.',
          WEEKLY_MOCK_LIMIT_REACHED: 'Trial permite 1 simulado por semana. Assine o Premium para simulados ilimitados.',
          MONTHLY_MOCK_LIMIT_REACHED: 'Seu plano permite 1 simulado por mês. O próximo estará disponível no início do mês.',
        };
        const reason = e?.message || '';
        alert(msgs[reason] || 'Limite do seu plano atingido. Considere fazer upgrade para Premium.');
        openPricing();
      }
      return;
    }

    try {
      let initialArea = mode === 'AREA' && targetArea ? targetArea : AreaOfKnowledge.HUMANAS;
      const initialBatch = await generateQuestionBatch(initialArea, 15, undefined, [], false, true, examId ?? undefined);

      setQuestions(initialBatch);
      setCurrentQuestionIndex(0);
      setUserAnswers({});

      const duration = mode === 'FULL' ? FULL_EXAM_DURATION : AREA_EXAM_DURATION;
      startTimer(duration);

      navigate(AppView.MOCK_EXAM);
    } catch (e: any) {
      let msg = 'Erro ao gerar simulado. Tente novamente.';
      if (e?.status === 429) msg = 'Muitos simulados sendo gerados agora. Aguarde um instante e tente novamente.';
      alert(msg);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [navigate, openPricing, startTimer]);

  const handleAnswerSelect = useCallback((optionIndex: number) => {
    if (isTimeUp) return;
    const currentQ = questions[currentQuestionIndex];
    if (!currentQ) return;

    fireGamificationEvent('ANSWER_QUESTION', {
      correct: optionIndex === currentQ.correctIndex,
      subject: currentQ.subject,
      difficulty: currentQ.difficulty,
    });

    setUserAnswers(prev => ({ ...prev, [currentQ.id]: optionIndex }));

    // Record answer in DB (fire-and-forget)
    const examId = currentExamIdRef.current;
    if (examId) {
      apiRequest(`/exams/${examId}/questions/${currentQuestionIndex}/answer`, 'PUT', { userAnswer: optionIndex })
        .catch(err => console.warn('[answer] Failed to record:', err?.message));
    }
  }, [isTimeUp, questions, currentQuestionIndex, fireGamificationEvent]);

  const handleNext = useCallback(async () => {
    const targetCount = simuladoTargetCountRef.current;
    const isFinished = (currentQuestionIndex + 1 >= targetCount) || isTimeUp;

    if (isFinished) {
      await finalizeSimulado(questions);
      return;
    }

    const isLastLoaded = currentQuestionIndex === questions.length - 1;
    if (isLastLoaded) {
      setLoading(true);
      const added = await loadMoreInBackground();
      setLoading(false);
      if (added <= 0) {
        openFetchError();
        return;
      }
    }
    setCurrentQuestionIndex(prev => prev + 1);
  }, [currentQuestionIndex, questions, isTimeUp, finalizeSimulado, loadMoreInBackground, openFetchError]);

  const handlePrevious = useCallback(() => {
    setCurrentQuestionIndex(prev => Math.max(0, prev - 1));
  }, []);

  const cancelMock = useCallback(() => {
    stopTimer();
    resetTimer();
    isFetchingRef.current = false;
    setLoading(false);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    navigate(AppView.HOME);
  }, [stopTimer, resetTimer, navigate]);

  const retryFetchNext = useCallback(async () => {
    setFetchErrorRetrying(true);
    try {
      const added = await loadMoreInBackground();
      if (added > 0) {
        closeFetchError();
        setCurrentQuestionIndex(prev => prev + 1);
      }
    } finally {
      setFetchErrorRetrying(false);
    }
  }, [loadMoreInBackground, closeFetchError, setFetchErrorRetrying]);

  const finalizeWithPartial = useCallback(() => {
    closeFetchError();
    const answeredCount = currentQuestionIndex + 1;
    finalizeSimulado(questions.slice(0, answeredCount));
  }, [closeFetchError, currentQuestionIndex, questions, finalizeSimulado]);

  const examDuration = simuladoMode === 'FULL' ? FULL_EXAM_DURATION : AREA_EXAM_DURATION;

  return (
    <MockContext.Provider value={{
      questions, userAnswers, currentQuestionIndex,
      simuladoMode, simuladoTargetCount, simuladoTargetArea,
      currentExamId, lastExamScore, lastExamBand,
      timeRemaining, isTimeUp, loading,
      startSimulado, handleAnswerSelect, handleNext, handlePrevious,
      cancelMock, retryFetchNext, finalizeWithPartial,
      formatTime, examDuration,
    }}>
      {children}
    </MockContext.Provider>
  );
}

export function useMock() {
  const ctx = useContext(MockContext);
  if (!ctx) throw new Error('useMock must be used inside MockProvider');
  return ctx;
}
