import React from 'react';
import { AreaOfKnowledge, AppView } from '../types';
import { useUser } from '../contexts/UserContext';
import { useGamification } from '../contexts/GamificationContext';
import { usePractice } from '../contexts/PracticeContext';
import { useMock } from '../contexts/MockContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useUI } from '../contexts/UIContext';
import { Button, Card, Badge } from './UIComponents';
import Logo from './Logo';
import { SUBJECT_AREAS, SPECIFIC_SUBJECTS } from '../constants';

const LockedCard = ({ children, onClick, title, icon }: any) => (
  <Card
    onClick={onClick}
    className="relative group transition-all duration-300 border-t-4 border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 grayscale hover:grayscale-0 cursor-pointer overflow-hidden"
  >
    <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-6 text-center opacity-100 group-hover:backdrop-blur-none transition-all">
      <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center mb-3 transform group-hover:scale-110 transition-transform">
        <span className="text-2xl">🔒</span>
      </div>
      <h3 className="font-bold text-slate-800 dark:text-white text-lg">Plano Premium</h3>
      <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">Clique para liberar esta ferramenta</p>
    </div>
    <div className="opacity-40">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-4xl">{icon}</div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">{title}</h2>
      </div>
      {children}
    </div>
  </Card>
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

  const handleLockedClick = () => openPricing();

  return (
    <div className="max-w-7xl mx-auto pt-12 px-4 animate-fade-in pb-12">
      <div className="text-center mb-16 flex flex-col items-center">
        <Logo className="h-20 md:h-24 mb-6" />
        <p className="text-xl text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Sua preparação completa impulsionada por Inteligência Artificial.
          Questões, simulados, notas TRI e <strong>correção de redação</strong>.
        </p>
        {isMockOnly && (
          <Badge color="yellow" className="mt-4 px-4 py-1.5 text-sm">
            ✨ Assinante Simulado (1 por mês)
          </Badge>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-12">
        {/* Card 1: Gerador Infinito */}
        {(isPremium || isTrial) ? (
          <Card className="hover:shadow-lg transition-shadow border-t-4 border-enem-blue cursor-pointer group flex flex-col md:col-span-1 xl:col-span-1">
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl group-hover:scale-110 transition-transform duration-200">♾️</div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Gerador Infinito</h2>
                </div>
                <p className="text-gray-500 dark:text-slate-400 mb-4 text-xs">
                  Pratique sem parar. Escolha uma matéria específica ou deixe a IA desafiar você.
                </p>
                <div className="space-y-4">
                  <div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Tópico..."
                        value={specificTopicInput}
                        onChange={(e) => setSpecificTopicInput(e.target.value)}
                        className="w-full border dark:border-slate-700 p-1.5 rounded text-xs focus:ring-2 focus:ring-enem-blue focus:outline-none bg-white dark:bg-slate-800 dark:text-white"
                      />
                      <Button
                        variant="primary"
                        onClick={() => startPractice(AreaOfKnowledge.MIXED, specificTopicInput)}
                        disabled={!specificTopicInput}
                        className="px-2 py-1 text-xs"
                      >
                        Ir
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {SPECIFIC_SUBJECTS.map((subject) => (
                      <button
                        key={subject.name}
                        disabled={practiceLoading}
                        onClick={() => startPractice(subject.area, subject.name)}
                        className="px-2 py-0.5 text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-100 dark:border-blue-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {subject.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <LockedCard title="Gerador Infinito" icon="♾️" onClick={handleLockedClick}>
            <div className="space-y-2">
              <p className="text-gray-500 dark:text-slate-400 text-xs">Pratique com questões ilimitadas geradas por IA.</p>
              <Badge color="blue" className="text-[8px]">Plano Premium</Badge>
            </div>
          </LockedCard>
        )}

        {/* Card 2: Simulado */}
        {(isPremium || isMockOnly || isTrial) ? (
          <Card className="hover:shadow-lg transition-shadow border-t-4 border-enem-yellow cursor-pointer relative overflow-hidden flex flex-col md:col-span-1 xl:col-span-1">
            <div className="absolute top-0 right-0 bg-enem-yellow text-[10px] font-bold px-2 py-1 rounded-bl">OFICIAL</div>
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl">⏱️</div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Simulado</h2>
                </div>
                <p className="text-gray-500 dark:text-slate-400 mb-6 text-xs">
                  {isMockOnly ? 'Plano Simulado Mensal: 1 tentativa por mês com correção TRI.' : 'Experiência real com cronômetro, 180 questões e cálculo TRI.'}
                </p>
                <div className="space-y-3">
                  <Button
                    onClick={() => startSimulado('FULL')}
                    disabled={mockLoading || (isMockOnly && hasTakenMockThisMonth())}
                    variant="primary"
                    className="w-full text-xs py-2"
                  >
                    {mockLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Gerando...
                      </span>
                    ) : isMockOnly && hasTakenMockThisMonth() ? '🔄 Usado este mês' : (isTrial ? '⏱️ Simulado Rápido' : '🏆 Completo (180q)')}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    {SUBJECT_AREAS.map(area => (
                      <button
                        key={area.id}
                        disabled={mockLoading || (isMockOnly && hasTakenMockThisMonth())}
                        onClick={() => startSimulado('AREA', area.id)}
                        className="p-1 text-[10px] bg-slate-50 dark:bg-slate-800/50 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 border border-slate-200 dark:border-slate-700 rounded text-center truncate dark:text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {area.name}
                      </button>
                    ))}
                  </div>
                  {isMockOnly && hasTakenMockThisMonth() && (
                    <p className="text-[9px] text-center text-red-500 font-bold mt-1">Refazer somente no próximo mês.</p>
                  )}
                  <button
                    onClick={() => navigate(AppView.EXAM_HISTORY)}
                    className="w-full text-[10px] text-slate-400 dark:text-slate-500 hover:text-enem-blue dark:hover:text-blue-400 mt-1 underline text-center transition-colors"
                  >
                    📋 Ver histórico de simulados
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <LockedCard title="Simulado" icon="⏱️" onClick={handleLockedClick}>
            <p className="text-gray-500 dark:text-slate-400 mb-6 text-xs">
              Acesso aos simulados oficiais com cálculo TRI profissional.
            </p>
          </LockedCard>
        )}

        {/* Card 3: Redação IA */}
        {isPremium ? (
          <Card className="hover:shadow-lg transition-shadow border-t-4 border-pink-500 cursor-pointer flex flex-col md:col-span-1 xl:col-span-1">
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl">📝</div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Redação IA</h2>
                </div>
                <p className="text-gray-500 dark:text-slate-400 mb-6 text-xs">
                  Correção oficial por competência ou modelos nota 1000.
                </p>
                <div className="space-y-2">
                  <Button
                    onClick={() => navigate(AppView.ESSAY)}
                    variant="primary"
                    className="w-full bg-pink-600 hover:bg-pink-700 text-sm py-1.5"
                  >
                    Escrever Redação
                  </Button>
                  <Button
                    onClick={() => navigate(AppView.ESSAY_BANK)}
                    variant="outline"
                    className="w-full text-xs py-1.5 border-pink-200 dark:border-pink-900/50 text-pink-700 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/30 transition-colors"
                  >
                    Banco Nota 1000
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <LockedCard title="Redação IA" icon="📝" onClick={handleLockedClick}>
            <p className="text-gray-500 dark:text-slate-400 mb-6 text-xs">
              Correção imediata e banco de redações nota 1000.
            </p>
          </LockedCard>
        )}

        {/* Card 4: Mapa de Estudos */}
        {(isPremium || isTrial) ? (
          <Card className="hover:shadow-lg transition-shadow border-t-4 border-green-500 cursor-pointer flex flex-col md:col-span-1 xl:col-span-1">
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl">🗺️</div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Mapa de Estudos</h2>
                </div>
                <p className="text-gray-500 dark:text-slate-400 mb-6 text-xs">
                  Trilhas estratégicas, mapas mentais e resumos visuais.
                </p>
                <Button
                  onClick={() => navigate(AppView.STUDY_GUIDE)}
                  variant="primary"
                  className="w-full bg-green-600 hover:bg-green-700 text-sm"
                >
                  Gerar Mapa
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <LockedCard title="Mapa de Estudos" icon="🗺️" onClick={handleLockedClick}>
            <p className="text-gray-500 dark:text-slate-400 mb-6 text-xs">
              Visualize seu progresso com mapas mentais gerados por IA.
            </p>
          </LockedCard>
        )}

        {/* Card 5: Evolução / Gamificação */}
        {(isPremium || isTrial) ? (
          <Card className="hover:shadow-lg transition-shadow border-t-4 border-purple-600 cursor-pointer flex flex-col md:col-span-1 xl:col-span-1">
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-4xl">🎮</div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Evolução</h2>
                </div>
                <p className="text-gray-500 dark:text-slate-400 mb-6 text-xs">
                  {isPremium ? 'Acompanhe seu nível e converse com o Tutor IA.' : 'Acompanhe seu nível e ranking no Trial.'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => navigate(AppView.GAMIFICATION)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-[10px] py-1 px-1"
                  >
                    Ranking
                  </Button>
                  <Button
                    onClick={() => isPremium ? setChatOpen(true) : handleLockedClick()}
                    variant={isPremium ? 'primary' : 'outline'}
                    className={`w-full text-[10px] py-1 px-1 ${isPremium ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400'}`}
                  >
                    {isPremium ? 'Tutor IA' : '🔒 Tutor'}
                  </Button>
                </div>
                <div className="mt-3 text-center text-xs font-bold text-indigo-800 dark:text-indigo-300">
                  Nível {navLevel} • {navXp} XP
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <LockedCard title="Evolução" icon="🎮" onClick={handleLockedClick}>
            <p className="text-gray-500 dark:text-slate-400 mb-6 text-xs">
              Gamificação completa e tutor 24h para tirar dúvidas.
            </p>
          </LockedCard>
        )}
      </div>
    </div>
  );
}
