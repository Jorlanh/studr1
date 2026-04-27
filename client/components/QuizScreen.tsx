import React from 'react';
import { AppView } from '../types';
import { useNavigation } from '../contexts/NavigationContext';
import { usePractice, PRACTICE_LOADING_STEPS } from '../contexts/PracticeContext';
import { useMock } from '../contexts/MockContext';
import QuestionCard from './QuestionCard';
import { Button, Badge, LoadingSpinner } from './UIComponents';

export default function QuizScreen() {
  const { view } = useNavigation();
  const isMock = view === AppView.MOCK_EXAM;

  const practice = usePractice();
  const mock = useMock();

  // Pull session state from whichever context is active
  const questions = isMock ? mock.questions : practice.questions;
  const userAnswers = isMock ? mock.userAnswers : practice.userAnswers;
  const currentQuestionIndex = isMock ? mock.currentQuestionIndex : practice.currentQuestionIndex;
  const loading = isMock ? mock.loading : practice.loading;
  const handleAnswerSelect = isMock ? mock.handleAnswerSelect : practice.handleAnswerSelect;
  const handleNext = isMock ? mock.handleNext : practice.handleNext;
  const handlePrevious = isMock ? mock.handlePrevious : practice.handlePrevious;
  const cancelAction = isMock ? mock.cancelMock : practice.cancelPractice;

  // Practice-specific
  const loadingStep = practice.loadingStep;

  // Mock-specific
  const timeRemaining = mock.timeRemaining;
  const isTimeUp = mock.isTimeUp;
  const simuladoTargetCount = mock.simuladoTargetCount;
  const formatTimeFn = mock.formatTime;

  const currentQ = questions[currentQuestionIndex];
  const hasAnswered = userAnswers[currentQ?.id] !== undefined;
  const isLastLoaded = currentQuestionIndex === questions.length - 1;
  const isSimuladoFinished = isMock && (currentQuestionIndex + 1 >= simuladoTargetCount || isTimeUp);

  return (
    <div className="max-w-4xl mx-auto pt-6 px-4 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 gap-4 transition-colors">
        <Button
          variant="outline"
          onClick={cancelAction}
          className="text-sm px-4 py-2 flex items-center gap-2 border-slate-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          <span className="text-lg">←</span> {isMock ? 'Cancelar Simulado' : 'Cancelar Prática'}
        </Button>
        <div className="flex items-center gap-3">
          <div className="h-2 w-24 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-enem-blue dark:bg-blue-500 animate-shimmer" style={{ width: '60%' }}></div>
          </div>
          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Progresso da Sessão</span>
        </div>
      </div>

      <div className="flex justify-between items-center mb-8 animate-fade-in relative">
        <div className="flex flex-col items-center">
          <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            {isMock ? 'Simulado ENEM' : 'Modo Prática Infinita'}
          </div>
          {isMock && (
            <div className={`text-4xl font-mono font-bold tabular-nums tracking-tighter ${isTimeUp ? 'text-red-500 animate-pulse' : 'text-enem-blue dark:text-blue-400'}`}>
              {formatTimeFn(timeRemaining)}
            </div>
          )}
          {!isMock && loading && (
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-enem-blue dark:text-blue-400 font-bold animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
              EXPANDINDO BANCO...
            </div>
          )}
        </div>

        <div className="flex flex-col items-end">
          <div className="font-bold text-gray-700 dark:text-slate-200 text-lg">
            Questão <span className="text-enem-blue dark:text-blue-400">{currentQuestionIndex + 1}</span>{' '}
            <span className="text-gray-400 dark:text-slate-500 font-normal text-sm">
              / {isMock ? simuladoTargetCount : '∞'}
            </span>
          </div>
          {currentQ && (
            <Badge color="blue" className="mt-1 shadow-sm">
              {currentQ.area}
            </Badge>
          )}
        </div>
      </div>

      {/* Question Area */}
      {loading && !currentQ ? (
        <div className="flex flex-col items-center justify-center p-12 w-full animate-fade-in">
          <LoadingSpinner size="md" />
          {questions.length === 0 ? (
            <div className="mt-6 text-center space-y-3">
              {PRACTICE_LOADING_STEPS.map((step, i) => (
                <p
                  key={i}
                  className={`text-sm font-medium transition-all duration-500 ${i <= loadingStep ? 'text-enem-blue dark:text-blue-400 opacity-100' : 'text-gray-300 dark:text-slate-700 opacity-50'} ${i === loadingStep ? 'animate-pulse scale-105' : ''}`}
                >
                  {i < loadingStep ? '✓' : i === loadingStep ? '⏳' : '○'} {step}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-enem-blue dark:text-blue-400 font-medium animate-pulse">
              Recalibrando nível dos exercícios...
            </p>
          )}
        </div>
      ) : (
        currentQ && (
          <div className="pb-32">
            {isTimeUp && (
              <div className="mb-6 p-5 bg-red-100 dark:bg-red-900/20 border-red-500 dark:border-red-800 border-2 rounded-2xl text-red-900 dark:text-red-400 font-bold text-center animate-bounce shadow-lg">
                ⚠️ TEMPO ESGOTADO! <br />
                <span className="text-xs font-normal opacity-80 uppercase tracking-wider">
                  Você não pode mais responder, apenas finalizar a prova.
                </span>
              </div>
            )}
            <QuestionCard
              question={currentQ}
              selectedOption={userAnswers[currentQ.id] ?? null}
              onSelect={handleAnswerSelect}
              showFeedback={!isMock && hasAnswered}
              disabled={isTimeUp}
            />
          </div>
        )
      )}

      {/* Sticky Footer Controls */}
      <div className="fixed bottom-0 left-0 w-full bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 p-4 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.3)] z-50 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 transition-colors">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">

          <div className="w-full md:w-auto flex justify-between md:justify-start gap-4 order-2 md:order-1">
            <Button
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
              className={`w-1/2 md:w-auto border-gray-200 dark:border-slate-700 ${currentQuestionIndex === 0 ? 'invisible' : ''}`}
              variant="outline"
            >
              ← Anterior
            </Button>
            <div className="text-xs text-gray-500 dark:text-slate-500 hidden md:flex items-center gap-1 self-center">
              {isMock && hasAnswered && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  Salvo na nuvem
                </>
              )}
            </div>
          </div>

          {isMock && (
            <div className="hidden md:block flex-1 mx-8 bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 order-1 md:order-2 overflow-hidden shadow-inner">
              <div
                className="bg-enem-blue dark:bg-blue-500 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(0,74,173,0.3)]"
                style={{ width: `${(currentQuestionIndex / simuladoTargetCount) * 100}%` }}
              />
            </div>
          )}

          <Button
            onClick={handleNext}
            disabled={isLastLoaded && loading}
            className="w-full md:w-auto shadow-xl order-1 md:order-3 hover:scale-105 transition-transform"
            variant="primary"
          >
            {loading && isLastLoaded ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Expandindo...
              </div>
            ) : (
              isSimuladoFinished ? 'Finalizar Simulado' : 'Próxima Questão →'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
