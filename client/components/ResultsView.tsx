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
  
  // Sisu/Prouni Form State
  const [program, setProgram] = useState("SiSU");
  const [course, setCourse] = useState("");
  const [uni, setUni] = useState("");

  const correctCount = questions.filter(q => userAnswers[q.id] === q.correctIndex).length;
  const accuracy = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;

  useEffect(() => {
    setScore(finalScore ?? 0);
  }, [finalScore]);

  const handleSisuAnalysis = async () => {
    if (!course) return;
    setLoadingAnalysis(true);
    setSisuPredictions([]);
    try {
      // Modificamos a chamada para passar o programa escolhido (SiSU, Prouni, FIES) no campo uni para a IA entender o contexto
      const queryContext = `${program} ${uni ? `- ${uni}` : ''}`;
      const preds = await analyzeSisuChances(score, course, queryContext);
      setSisuPredictions(preds);
      
      if (recommendations.length === 0) {
          const recs = await generateStudyPlan(questions.map(q => ({
            subject: q.subject,
            correct: userAnswers[q.id] === q.correctIndex
          })));
          setRecommendations(recs);
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao consultar a base de notas. O servidor pode estar ocupado.");
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
    [AreaOfKnowledge.MIXED]:      'Média',
  };

  const chartData = Object.values(AreaOfKnowledge).filter(k => k !== AreaOfKnowledge.MIXED).map(area => {
    const qs = questions.filter(q => q.area === area);
    if (qs.length === 0) return null;
    const correct = qs.filter(q => userAnswers[q.id] === q.correctIndex).length;
    return { name: SHORT_AREA_LABELS[area], score: (correct / qs.length) * 100 };
  }).filter(Boolean);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in p-4 pb-20">
      {/* Header with Back Button */}
      <div className="flex flex-col md:flex-row justify-between items-center relative gap-4">
        <Button onClick={onBackToHome} variant="outline" className="text-sm border-slate-200 dark:border-slate-800 dark:text-slate-400 md:absolute md:left-0">
          ← Voltar ao Início
        </Button>
        <div className="text-center w-full mt-8 md:mt-0">
            <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Resultado Oficial (TRI)</h1>
            <p className="text-slate-500 dark:text-slate-400">Baseado no modelo Logístico de 3 Parâmetros do INEP.</p>
            {timeElapsed && <div className="mt-3"><Badge color="yellow">Tempo de Prova: {timeElapsed}</Badge></div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Score Card */}
        <Card className="col-span-1 md:col-span-1 bg-gradient-to-br from-enem-blue to-blue-800 text-white flex flex-col items-center justify-center p-8">
          <div className="text-sm font-medium opacity-80 uppercase tracking-wide">Média Geral TRI</div>
          <div className="text-6xl font-extrabold my-4">{score}</div>
          {scoreBand && (
            <div className="text-xs font-black uppercase tracking-widest bg-white/20 rounded-full px-3 py-1 mb-3">{scoreBand}</div>
          )}
          <div className="flex justify-between w-full px-4 text-sm opacity-90 mt-2">
            <span>Acertos: {correctCount}/{questions.length}</span>
            <span>{accuracy.toFixed(1)}%</span>
          </div>
        </Card>

        {/* Performance Chart */}
        <Card className="col-span-1 md:col-span-2 p-6">
          <h3 className="font-black text-slate-400 uppercase text-[10px] tracking-widest mb-6 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-enem-blue"></div>
            Desempenho Bruto por Área
          </h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData as any}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.1} />
                <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="score" radius={[8, 8, 8, 8]} barSize={40}>
                  {
                    (chartData as any).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.score >= 70 ? '#10b981' : entry.score >= 40 ? '#f59e0b' : '#ef4444'} />
                    ))
                  }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* SiSU Simulator Section */}
      <Card className="border-t-4 border-enem-blue bg-white dark:bg-slate-900 p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-tighter">
              <span className="text-2xl">🏛️</span> Simulador de Aprovação
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Verifique se a sua nota é suficiente nos programas do governo.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
             {/* Dropdown de Programa */}
             <select 
               value={program}
               onChange={(e) => setProgram(e.target.value)}
               className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm font-bold focus:ring-2 focus:ring-enem-blue outline-none text-slate-700 dark:text-slate-200"
             >
                <option value="SiSU">SiSU (Federais)</option>
                <option value="ProUni">ProUni (Bolsas)</option>
                <option value="FIES">FIES (Financiamento)</option>
             </select>

             <input 
              type="text" 
              placeholder="Curso (ex: Direito)" 
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl w-full lg:w-48 text-sm focus:ring-2 focus:ring-enem-blue outline-none transition-all dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
            />
            <input 
              type="text" 
              placeholder="Universidade (Opcional)" 
              value={uni}
              onChange={(e) => setUni(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl w-full lg:w-48 text-sm focus:ring-2 focus:ring-enem-blue outline-none transition-all dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 shadow-sm"
            />
            <Button onClick={handleSisuAnalysis} variant="primary" className="shadow-lg shadow-enem-blue/20 bg-enem-blue font-black uppercase tracking-widest text-xs py-3 px-8" disabled={loadingAnalysis || score === 0 || !course}>
              {loadingAnalysis ? 'Analisando...' : 'Calcular'}
            </Button>
          </div>
        </div>

        {loadingAnalysis && (
            <div className="py-10 flex flex-col items-center">
                <LoadingSpinner size="md" />
                <p className="mt-4 text-sm font-bold text-slate-500 animate-pulse">Buscando notas de corte do {program}...</p>
            </div>
        )}

        {!loadingAnalysis && sisuPredictions.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
            {sisuPredictions.map((pred, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col gap-3 hover:-translate-y-1 transition-transform shadow-sm">
                <div className="flex justify-between items-start">
                  <h4 className="font-extrabold text-slate-800 dark:text-slate-100 line-clamp-2 text-sm leading-tight" title={pred.university}>{pred.university}</h4>
                  <Badge color={pred.chance.toLowerCase().includes('alta') ? 'green' : pred.chance.toLowerCase().includes('média') || pred.chance.toLowerCase().includes('media') ? 'yellow' : 'red'}>
                      {pred.chance}
                  </Badge>
                </div>
                <div>
                   <div className="text-sm font-bold text-enem-blue dark:text-blue-400">{pred.course}</div>
                   <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-1">{pred.modality || program}</div>
                </div>
                <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nota de Corte</span>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-100">{pred.cutOffScore}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* AI Recommendations */}
      {recommendations.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
           <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-2 mb-2">
              <span className="text-2xl">📋</span> O Que Estudar Agora
           </h3>
           <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 border-l-purple-500 p-5 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white mb-1">{rec.topic}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{rec.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                     <Badge color="blue" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"># {rec.area}</Badge>
                     <Badge color={rec.priority.toLowerCase() === 'alta' ? 'red' : 'yellow'}>
                        Prioridade {rec.priority}
                     </Badge>
                  </div>
                </div>
              ))}
           </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-6">
        <Button onClick={onNewMockExam} variant="primary" className="w-full sm:w-auto px-8 py-3">
          Refazer Simulado
        </Button>
        <Button onClick={onPracticeMore} variant="outline" className="w-full sm:w-auto px-8 py-3">
          Prática Infinita
        </Button>
      </div>
    </div>
  );
};

export default ResultsView;