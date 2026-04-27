
import React, { useEffect, useState } from 'react';
import { AreaOfKnowledge, Question, SisuPrediction, StudyRecommendation } from '../types';
import { analyzeSisuChances, generateStudyPlan } from '../services/aiClientService';
import { Button, Card, LoadingSpinner, Badge } from './UIComponents';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ResultsViewProps {
  questions: Question[];
  userAnswers: Record<string, number>;
  finalScore?: number;
  scoreBand?: string;
  onBackToHome: () => void;
  onNewMockExam: () => void;
  onPracticeMore: () => void;
  timeElapsed?: string;
}

const ResultsView: React.FC<ResultsViewProps> = ({ questions, userAnswers, finalScore, scoreBand, onBackToHome, onNewMockExam, onPracticeMore, timeElapsed }) => {
  const [score, setScore] = useState(0);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [sisuPredictions, setSisuPredictions] = useState<SisuPrediction[]>([]);
  const [recommendations, setRecommendations] = useState<StudyRecommendation[]>([]);
  
  // Sisu Form State
  const [course, setCourse] = useState("Medicina");
  const [uni, setUni] = useState("");

  const correctCount = questions.filter(q => userAnswers[q.id] === q.correctIndex).length;
  const accuracy = (correctCount / questions.length) * 100;

  useEffect(() => {
    setScore(finalScore ?? 300);
  }, [finalScore]);

  const handleSisuAnalysis = async () => {
    if (!course) return;
    setLoadingAnalysis(true);
    try {
      // Run sequentially to avoid Rate Limiting (429) on free tier
      const preds = await analyzeSisuChances(score, course, uni);
      setSisuPredictions(preds);
      
      const recs = await generateStudyPlan(questions.map(q => ({
        subject: q.subject,
        correct: userAnswers[q.id] === q.correctIndex
      })));
      setRecommendations(recs);
    } catch (error) {
      console.error(error);
      alert("Erro ao analisar dados com IA. Tente novamente em alguns segundos.");
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // Prepare Chart Data
  const SHORT_AREA_LABELS: Record<AreaOfKnowledge, string> = {
    [AreaOfKnowledge.NATUREZA]:   'Natureza',
    [AreaOfKnowledge.HUMANAS]:    'Humanas',
    [AreaOfKnowledge.LINGUAGENS]: 'Linguagens',
    [AreaOfKnowledge.MATEMATICA]: 'Matemática',
    [AreaOfKnowledge.MIXED]:      'Todas',
  };

  const chartData = Object.values(AreaOfKnowledge).filter(k => k !== AreaOfKnowledge.MIXED).map(area => {
    const qs = questions.filter(q => q.area === area);
    if (qs.length === 0) return null;
    const correct = qs.filter(q => userAnswers[q.id] === q.correctIndex).length;
    return { name: SHORT_AREA_LABELS[area], score: (correct / qs.length) * 100 };
  }).filter(Boolean);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in p-4">
      {/* Header with Back Button */}
      <div className="flex flex-col md:flex-row justify-between items-center relative gap-4">
        <Button onClick={onBackToHome} variant="outline" className="text-sm border-slate-200 dark:border-slate-800 dark:text-slate-400 md:absolute md:left-0">
          ← Voltar ao Início
        </Button>
        <div className="text-center w-full">
            <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Resultado do Simulado</h1>
            <p className="text-slate-500 dark:text-slate-400">Veja seu desempenho detalhado e projeções.</p>
            {timeElapsed && <div className="mt-3"><Badge color="yellow">Tempo de Prova: {timeElapsed}</Badge></div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Score Card */}
        <Card className="col-span-1 md:col-span-1 bg-gradient-to-br from-enem-blue to-blue-800 text-white flex flex-col items-center justify-center p-8">
          <div className="text-sm font-medium opacity-80 uppercase tracking-wide">Nota TRI (3PL)</div>
          <div className="text-6xl font-extrabold my-4">{score}</div>
          {scoreBand && (
            <div className="text-xs font-black uppercase tracking-widest bg-white/20 rounded-full px-3 py-1 mb-3">{scoreBand}</div>
          )}
          <div className="flex justify-between w-full px-4 text-sm opacity-90">
            <span>Acertos: {correctCount}/{questions.length}</span>
            <span>{accuracy.toFixed(1)}%</span>
          </div>
        </Card>

        {/* Performance Chart */}
        <Card className="col-span-1 md:col-span-2 p-6">
          <h3 className="font-black text-slate-400 uppercase text-[10px] tracking-widest mb-6 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-enem-blue"></div>
            Desempenho por Área
          </h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData as any}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.1} />
                <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="score" radius={[8, 8, 8, 8]} barSize={40}>
                  {
                    (chartData as any).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.score > 70 ? '#22c55e' : entry.score > 40 ? '#fbbf24' : '#ef4444'} />
                    ))
                  }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* SiSU Simulator Section */}
      <Card className="border-t-4 border-enem-yellow bg-slate-50/50 dark:bg-slate-900/30 p-8">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-8 gap-6">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-tighter">
              <span className="text-2xl">🎓</span> Simulador SiSU
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Compare sua nota com as de universidades reais em todo o Brasil.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
             <input 
              type="text" 
              placeholder="Curso (ex: Medicina)" 
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl w-full lg:w-56 text-sm focus:ring-2 focus:ring-enem-yellow/50 outline-none transition-all dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
            />
            <input 
              type="text" 
              placeholder="Sua Universidade (Opcional)" 
              value={uni}
              onChange={(e) => setUni(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl w-full lg:w-56 text-sm focus:ring-2 focus:ring-enem-yellow/50 outline-none transition-all dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
            />
            <Button onClick={handleSisuAnalysis} variant="primary" className="shadow-lg shadow-enem-blue/20 bg-enem-blue font-black uppercase tracking-widest text-xs py-3 px-8" disabled={loadingAnalysis || score === 0}>
              {loadingAnalysis ? 'Consultando...' : 'Calcular Chances'}
            </Button>
          </div>
        </div>

        {loadingAnalysis && <LoadingSpinner />}

        {!loadingAnalysis && sisuPredictions.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sisuPredictions.map((pred, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-3 hover:scale-[1.02] transition-all group shadow-sm hover:shadow-xl hover:border-enem-yellow/30">
                <div className="flex justify-between items-start">
                  <h4 className="font-extrabold text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-enem-blue transition-colors" title={pred.university}>{pred.university}</h4>
                  <Badge color={pred.chance === 'Alta' ? 'green' : pred.chance === 'Média' ? 'yellow' : 'red'}>{pred.chance}</Badge>
                </div>
                <div>
                   <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">{pred.course}</div>
                   <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter mt-1">{pred.modality}</div>
                </div>
                <div className="mt-2 pt-3 border-t dark:border-slate-800 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Corte do curso</span>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-200">{pred.cutOffScore}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* AI Recommendations */}
      {recommendations.length > 0 && (
        <div className="grid grid-cols-1 gap-6">
           <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-2">
              <span className="text-2xl">📚</span> Plano de Estudo Recomendado
           </h3>
           <div className="space-y-4">
              {recommendations.map((rec, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 border-l-4 border-l-enem-blue p-6 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 hover:shadow-lg transition-all">
                  <div className="flex-1 text-center md:text-left">
                    <h4 className="font-black text-lg text-slate-800 dark:text-white mb-1">{rec.topic}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{rec.reason}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                     <Badge color="blue" className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"># {rec.area}</Badge>
                     <Badge color={rec.priority === 'Alta' ? 'red' : 'yellow'}>Prioridade {rec.priority === 'Alta' ? 'Máxima' : 'Moderada'}</Badge>
                  </div>
                </div>
              ))}
           </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-8 pb-12">
        <Button onClick={onNewMockExam} variant="primary" className="w-full sm:w-auto">
          Refazer Simulado
        </Button>
        <Button onClick={onPracticeMore} variant="outline" className="w-full sm:w-auto">
          Praticar Mais (Prática Infinita)
        </Button>
      </div>
    </div>
  );
};

export default ResultsView;
