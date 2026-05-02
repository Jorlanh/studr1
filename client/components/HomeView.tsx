import React from 'react';
import { AreaOfKnowledge, AppView } from '../types';
import { useUser } from '../contexts/UserContext';
import { useGamification } from '../contexts/GamificationContext';
import { usePractice } from '../contexts/PracticeContext';
import { useMock } from '../contexts/MockContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useUI } from '../contexts/UIContext';
import { Button, Badge } from './UIComponents';
import Logo from './Logo';
import { SUBJECT_AREAS, SPECIFIC_SUBJECTS } from '../constants';

const BentoCard = ({ children, className = '', locked = false, onLockedClick }: any) => (
  <div 
    onClick={locked ? onLockedClick : undefined}
    className={`relative group rounded-3xl p-6 transition-all duration-300 overflow-hidden ${locked ? 'cursor-pointer' : ''} ${className}`}
  >
    {/* Glassmorphism Background */}
    <div className={`absolute inset-0 transition-opacity duration-300 ${locked ? 'bg-slate-200/80 dark:bg-slate-900/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center' : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-md shadow-xl border border-slate-100 dark:border-slate-700/50 hover:shadow-2xl hover:-translate-y-1'}`}>
        {locked && (
            <div className="text-center opacity-100 transform group-hover:scale-110 transition-transform">
                <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">🔒</span>
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white text-lg">Premium</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">Desbloquear acesso</p>
            </div>
        )}
    </div>
    
    <div className={`relative z-10 h-full flex flex-col ${locked ? 'opacity-30 grayscale blur-[2px]' : ''}`}>
        {children}
    </div>
  </div>
);

export default function HomeView() {
  const { user, trialActive, isTrial } = useUser();
  const { navLevel, navXp } = useGamification();
  const { startPractice, loading: practiceLoading, specificTopicInput, setSpecificTopicInput } = usePractice();
  const { startSimulado, loading: mockLoading } = useMock();
  const { navigate } = useNavigation();
  const { openPricing, setChatOpen } = useUI();

  const isPremium = user?.isPremium;
  const isMockOnly = user?.subscriptionStatus === 'MOCK_ONLY';

  const hasTakenMockThisMonth = () => {
    if (!user?.id) return false;
    const lastMock = localStorage.getItem(`studr_last_mock_${user.id}`);
    if (!lastMock) return false;
    const lastMockDate = new Date(lastMock);
    const now = new Date();
    return lastMockDate.getMonth() === now.getMonth() && lastMockDate.getFullYear() === now.getFullYear();
  };

  return (
    <div className="max-w-7xl mx-auto pt-10 px-4 animate-fade-in pb-20">
      
      {/* Header Moderno */}
      <div className="flex flex-col items-center text-center mb-12">
        <Logo className="h-16 md:h-20 mb-8 transform hover:scale-105 transition-transform" />
        <h1 className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tight mb-4">
          O Seu Futuro <span className="text-transparent bg-clip-text bg-gradient-to-r from-enem-blue to-purple-600">Aprovado.</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl">
          A única plataforma inteligente que calibra seus estudos com a verdadeira <strong className="text-slate-700 dark:text-slate-200">Teoria de Resposta ao Item (TRI)</strong>.
        </p>
        {isMockOnly && (
          <Badge color="yellow" className="mt-6 px-5 py-2 text-sm shadow-sm backdrop-blur-md bg-yellow-500/10 border border-yellow-500/20">
            ✨ Assinante Simulado Mensal
          </Badge>
        )}
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[minmax(180px,auto)]">

        {/* Bloco 1: SIMULADO (Destaque Principal - Span 8 colunas) */}
        <BentoCard 
          className="md:col-span-8 md:row-span-2 bg-gradient-to-br from-slate-50 to-blue-50/50 dark:from-slate-900 dark:to-blue-900/10"
          locked={!(isPremium || isMockOnly || isTrial)}
          onLockedClick={openPricing}
        >
          <div className="flex justify-between items-start mb-6">
             <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-4xl bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm">⏱️</span>
                  <h2 className="text-2xl font-black text-slate-800 dark:text-white">Simulado Oficial</h2>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
                  {isMockOnly ? 'Plano Mensal: 1 tentativa por mês com calibração TRI.' : 'Experiência real com 180 questões e cálculo TRI avançado.'}
                </p>
             </div>
             <Badge color="blue" className="hidden md:flex">Padrão ENEM</Badge>
          </div>

          <div className="mt-auto space-y-4">
             <Button
                onClick={() => startSimulado('FULL')}
                disabled={mockLoading || (isMockOnly && hasTakenMockThisMonth())}
                className="w-full text-sm md:text-base py-4 font-bold bg-enem-blue hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
              >
                {mockLoading ? 'Calibrando IA...' : isMockOnly && hasTakenMockThisMonth() ? '🔄 Limite Mensal Atingido' : (isTrial ? '⏱️ Iniciar Simulado Rápido' : '🏆 Iniciar Simulado Completo (180q)')}
             </Button>

             <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {SUBJECT_AREAS.map(area => (
                  <button
                    key={area.id}
                    disabled={mockLoading || (isMockOnly && hasTakenMockThisMonth())}
                    onClick={() => startSimulado('AREA', area.id)}
                    className="p-3 text-[11px] md:text-xs font-bold bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-slate-600 dark:text-slate-300 transition-colors shadow-sm"
                  >
                    {area.name}
                  </button>
                ))}
             </div>
             
             <div className="flex justify-end mt-2">
                <button onClick={() => navigate(AppView.EXAM_HISTORY)} className="text-xs font-bold text-slate-400 hover:text-enem-blue transition-colors">
                  Ver meu histórico completo →
                </button>
             </div>
          </div>
        </BentoCard>

        {/* Bloco 2: EVOLUÇÃO (Span 4 colunas) */}
        <BentoCard 
          className="md:col-span-4 md:row-span-1 bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/10 dark:to-slate-900"
          locked={!(isPremium || isTrial)}
          onLockedClick={openPricing}
        >
          <div className="flex items-center gap-3 mb-4">
             <span className="text-3xl bg-white dark:bg-slate-800 p-2.5 rounded-xl shadow-sm">🎮</span>
             <h2 className="text-xl font-black text-slate-800 dark:text-white">Seu Nível</h2>
          </div>
          <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800 rounded-2xl py-4 border border-slate-100 dark:border-slate-700 shadow-sm mb-4">
             <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">{navLevel}</span>
             <span className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{navXp} XP Acumulados</span>
          </div>
          <Button onClick={() => navigate(AppView.GAMIFICATION)} variant="outline" className="w-full text-xs font-bold py-2 border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30">
            Ver Ranking Completo
          </Button>
        </BentoCard>

        {/* Bloco 3: TUTOR IA (Span 4 colunas) */}
        <BentoCard 
          className="md:col-span-4 md:row-span-1 bg-slate-900 text-white"
          locked={!isPremium}
          onLockedClick={openPricing}
        >
          <div className="flex items-center gap-3 mb-3">
             <span className="text-3xl bg-white/10 p-2.5 rounded-xl">🤖</span>
             <h2 className="text-xl font-black text-white">Tutor 24h</h2>
          </div>
          <p className="text-slate-400 text-xs mb-auto pb-4">Resolva dúvidas de exatas ou humanas instantaneamente.</p>
          <Button onClick={() => setChatOpen(true)} className="w-full text-xs font-bold py-3 bg-white text-slate-900 hover:bg-slate-100 shadow-xl">
            Chamar Tutor Agora
          </Button>
        </BentoCard>

        {/* Bloco 4: REDAÇÃO IA (Span 6 colunas) */}
        <BentoCard 
          className="md:col-span-6 md:row-span-2 bg-gradient-to-br from-pink-50 to-rose-50/30 dark:from-pink-900/10 dark:to-slate-900"
          locked={!isPremium}
          onLockedClick={openPricing}
        >
          <div className="flex items-center gap-3 mb-4">
             <span className="text-4xl bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-sm">📝</span>
             <h2 className="text-2xl font-black text-slate-800 dark:text-white">Redação IA</h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
            Treine com temas atualizados e receba correção técnica focada nas 5 competências do MEC.
          </p>
          
          <div className="mt-auto flex flex-col gap-3">
             <Button onClick={() => navigate(AppView.ESSAY)} className="w-full text-sm py-4 font-bold bg-pink-600 hover:bg-pink-700 text-white shadow-lg shadow-pink-500/20">
                ✍️ Escrever Nova Redação
             </Button>
             <Button onClick={() => navigate(AppView.ESSAY_BANK)} variant="outline" className="w-full text-sm py-3 font-bold border-pink-200 text-pink-700 dark:border-pink-800 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20">
                📚 Ler Modelos Nota 1000
             </Button>
          </div>
        </BentoCard>

        {/* Bloco 5: GERADOR INFINITO (Span 6 colunas) */}
        <BentoCard 
          className="md:col-span-6 md:row-span-2"
          locked={!(isPremium || isTrial)}
          onLockedClick={openPricing}
        >
          <div className="flex items-center gap-3 mb-4">
             <span className="text-4xl bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl shadow-sm">♾️</span>
             <h2 className="text-2xl font-black text-slate-800 dark:text-white">Prática Infinita</h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
             Digite um assunto ou escolha uma matéria para gerar listas de exercícios infinitas sob medida.
          </p>
          
          <div className="mt-auto space-y-4">
             <div className="flex gap-2">
                <input
                   type="text"
                   placeholder="Ex: Revolução Industrial..."
                   value={specificTopicInput}
                   onChange={(e) => setSpecificTopicInput(e.target.value)}
                   className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm focus:ring-2 focus:ring-enem-blue focus:border-transparent bg-slate-50 dark:bg-slate-800 dark:text-white transition-all shadow-inner"
                />
                <Button onClick={() => startPractice(AreaOfKnowledge.MIXED, specificTopicInput)} disabled={!specificTopicInput} variant="primary" className="px-6 py-3 font-bold">
                   Gerar
                </Button>
             </div>
             
             <div className="flex flex-wrap gap-2 pt-2">
                {SPECIFIC_SUBJECTS.map((subject) => (
                   <button
                      key={subject.name}
                      disabled={practiceLoading}
                      onClick={() => startPractice(subject.area, subject.name)}
                      className="px-3 py-1.5 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                   >
                      {subject.name}
                   </button>
                ))}
             </div>
          </div>
        </BentoCard>

        {/* Bloco 6: MAPA MENTAL (Span 12 colunas) */}
        <BentoCard 
          className="md:col-span-12 md:row-span-1 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 flex flex-col md:flex-row items-center justify-between gap-6"
          locked={!(isPremium || isTrial)}
          onLockedClick={openPricing}
        >
           <div className="flex items-center gap-4">
              <span className="text-5xl drop-shadow-sm">🗺️</span>
              <div>
                 <h2 className="text-xl font-black text-slate-800 dark:text-white">Mapas Mentais Inteligentes</h2>
                 <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Conecte os pontos e revise conceitos visualmente antes da prova.</p>
              </div>
           </div>
           <Button onClick={() => navigate(AppView.STUDY_GUIDE)} className="w-full md:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-500/20">
              Gerar Mapa de Estudo
           </Button>
        </BentoCard>

      </div>
    </div>
  );
}