import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppView, EssayTheme, EssayCorrection } from '../types';
import { generateEssayTheme, evaluateEssay } from '../services/aiClientService';
import { Button, Badge, FullPageLoader } from './UIComponents';
import { useTimer, calculateEssayTimeLimit, formatTime } from '../hooks/useTimer';
import { useNavigation } from '../contexts/NavigationContext';
import { apiRequest } from '../services/apiService';

export default function TowerEssayView() {
  const { navigate } = useNavigation();
  
  const [step, setStep] = useState<'LOADING' | 'WRITING' | 'RESULT'>('LOADING');
  const [theme, setTheme] = useState<EssayTheme | null>(null);
  const [essayText, setEssayText] = useState("");
  const [result, setResult] = useState<EssayCorrection | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const essayTextRef = useRef(""); 
  const telemetry = useRef({ keystrokes: 0, pausesOver5s: 0, paragraphCount: 0 });
  const lastTypingTime = useRef<number>(Date.now());

  // Dados da Torre
  const [towerLevel, setTowerLevel] = useState(1);
  const [targetScore, setTargetScore] = useState(500);

  // 1. ARRANCAR A BATALHA IMEDIATAMENTE (Sem ecrã de setup)
  useEffect(() => {
    const floorStr = sessionStorage.getItem('studr_current_tower_floor');
    if (floorStr) {
      const floor = JSON.parse(floorStr);
      setTowerLevel(floor.floorNumber || 1);
      setTargetScore(floor.targetScore || 500);
    }

    const startBossFight = async () => {
      setStep('LOADING');
      try {
        const newTheme = await generateEssayTheme();
        setTheme(newTheme);
      } catch (e) {
        console.error("Erro na IA ao gerar tema:", e);
        // Fallback pesado caso a IA falhe, para nunca travar a batalha
        setTheme({ 
          title: "Os desafios da implementação tecnológica na educação pública brasileira", 
          motivatingTexts: [
            "A disparidade de infraestrutura no Brasil agrava a exclusão digital em escolas públicas.", 
            "Especialistas apontam que tecnologia sem pedagogia não resolve o problema da evasão escolar."
          ] 
        });
      }
      setStep('WRITING');
      lastTypingTime.current = Date.now();
    };

    startBossFight();
  }, []);

  // 2. MOTOR DE TEMPO DA TORRE
  const timer = useTimer(() => {
    if (step === 'WRITING') {
      handleEvaluate(essayTextRef.current);
    }
  });

  useEffect(() => {
    if (step === 'WRITING') {
      const limit = calculateEssayTimeLimit(towerLevel);
      timer.startTimer(limit);
    }
    return () => timer.stopTimer();
  }, [step, towerLevel]);

  // 3. AVALIAÇÃO DA IA DE ELITE
  const handleEvaluate = useCallback(async (forcedText?: string) => {
    const currentText = forcedText || essayTextRef.current;
    if (!theme || !currentText.trim()) return;

    setIsEvaluating(true);
    try {
      telemetry.current.paragraphCount = currentText.split(/\n\s*\n/).filter(p => p.trim() !== '').length;
      
      const performanceData = {
        towerLevel,
        maxTime: timer.maxTime,
        timeSpentSeconds: timer.maxTime - timer.timeRemaining,
        telemetry: telemetry.current
      };

      // @ts-expect-error bypass TS cache
      const correction = await evaluateEssay(theme.title, currentText, performanceData);
      setResult(correction);
      timer.stopTimer();
      setStep('RESULT');
    } catch (e) {
      alert("Erro ao corrigir redação. Tente submeter novamente.");
      console.error(e);
    } finally {
      setIsEvaluating(false);
    }
  }, [theme, towerLevel, timer]);

  // 4. SALVAR E DOMINAR O PRÉDIO (Chamada à API)
  const handleClaimBuilding = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const floorStr = sessionStorage.getItem('studr_current_tower_floor');
      if (floorStr) {
        const floor = JSON.parse(floorStr);
        const isWin = result.totalScore >= targetScore;
        let earnedStars = 0;
        
        if (isWin) {
           earnedStars = result.totalScore >= targetScore * 1.5 ? 3 : result.totalScore >= targetScore * 1.2 ? 2 : 1;
           if(earnedStars > 3) earnedStars = 3;
        }

        await apiRequest('/tower/submit', 'POST', { 
            floorId: floor.id, 
            score: result.totalScore,
            stars: earnedStars 
        });
      }
      
      sessionStorage.removeItem('studr_exam_mode');
      sessionStorage.removeItem('studr_tower_essay_theme');
      navigate(AppView.TOWER);
    } catch (err) {
      console.error("Erro ao salvar progresso:", err);
      alert("Erro ao conectar com a base. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    sessionStorage.removeItem('studr_exam_mode');
    sessionStorage.removeItem('studr_tower_essay_theme');
    navigate(AppView.TOWER);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEssayText(e.target.value);
    essayTextRef.current = e.target.value;
  };

  const handleKeyDown = () => {
    telemetry.current.keystrokes += 1;
    const now = Date.now();
    if (now - lastTypingTime.current > 5000) telemetry.current.pausesOver5s += 1;
    lastTypingTime.current = now;
  };

  // UI Helpers
  const wordCount = essayText.trim().split(/\s+/).filter(w => w.length > 0).length;
  const estimatedLines = Math.ceil(wordCount / 10);
  const canSubmit = wordCount >= 80 && estimatedLines >= 7;

  if (step === 'LOADING') {
    return <FullPageLoader text={`O Chefão do Prédio ${towerLevel} está a preparar o tema. Prepare-se...`} />;
  }

  if (isEvaluating) {
    return <FullPageLoader text="A IA de Elite está a julgar a sua tese e a avaliar a sua resistência mental..." />;
  }

  return (
    <div className={`max-w-7xl mx-auto p-3 sm:p-6 transition-all duration-1000 ${timer.isFinalBattle ? 'bg-red-950/20 rounded-3xl' : 'animate-fade-in'}`}>
      {/* HEADER DA BATALHA */}
      <div className="flex items-center justify-between mb-8">
        <Button variant="outline" onClick={handleCancel} className="text-sm px-4 py-2 border-red-500/30 text-red-500 hover:bg-red-500/10">🏳️ Fugir da Batalha</Button>
        <div className="flex items-center gap-3">
          <Badge color="purple" className="animate-pulse px-4 py-1 text-sm">PRÉDIO {towerLevel} - CHEFÃO (META: {targetScore})</Badge>
        </div>
      </div>

      {step === 'WRITING' && theme && (
        <div className="grid lg:grid-cols-12 gap-8 lg:items-start animate-fade-in">
          {/* SIDEBAR TEMA */}
          <div className="lg:col-span-4 space-y-6 sticky top-24">
            <div className="bg-gradient-to-br from-purple-800 to-slate-900 p-6 rounded-2xl text-white shadow-xl shadow-purple-900/40 border border-purple-500/30">
              <h3 className="text-[10px] font-black uppercase mb-3 tracking-[0.2em] flex items-center gap-2 text-purple-300">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                Desafio Final
              </h3>
              <p className="text-lg font-extrabold leading-tight">{theme.title}</p>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Textos Motivadores</h4>
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
                {theme.motivatingTexts.map((text, i) => (
                  <div key={i} className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700 text-sm text-slate-300 shadow-sm leading-relaxed relative">
                    <span className="absolute -left-2 top-4 w-6 h-6 rounded-lg bg-purple-900 border border-purple-500 flex items-center justify-center text-[10px] font-bold text-white">{i + 1}</span>
                    <div className="pl-4">{text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AREA DE ESCRITA */}
          <div className="lg:col-span-8 flex flex-col">
            <div className={`bg-slate-800/80 rounded-t-2xl p-4 flex justify-between items-center text-xs font-bold shadow-sm transition-colors border-b-0 ${timer.isFinalBattle ? 'border-red-600 text-red-500 bg-red-950/40' : 'border-slate-700 text-slate-300'}`}>
              <div className="flex items-center gap-4">
                <span className="uppercase tracking-tighter text-purple-400">Folha de Batalha</span>
                <span className="text-lg animate-pulse">⏱ {formatTime(timer.timeRemaining)}</span>
              </div>
              <div className="flex gap-4">
                <span className={wordCount < 80 ? 'text-amber-500' : 'text-green-500'}>{wordCount} / 80 pal.</span>
                <span className={estimatedLines >= 7 && estimatedLines <= 30 ? 'text-green-500' : 'text-amber-500'}>~{estimatedLines} lin.</span>
              </div>
            </div>

            <textarea
              className={`w-full flex-1 min-h-[70vh] pl-8 pr-8 py-8 border rounded-b-2xl focus:outline-none resize-none font-serif text-lg md:text-xl leading-[2.1] shadow-2xl transition-all custom-scrollbar ${timer.isFinalBattle ? 'bg-red-950/40 focus:ring-red-500 border-red-600 text-red-100 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-slate-900 focus:ring-purple-500 border-slate-700 text-slate-100'}`}
              placeholder="A batalha começou. Escreva a sua redação..."
              value={essayText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              disabled={timer.isTimeUp}
              autoFocus
            />

            <div className="mt-6 flex flex-col items-end">
               <Button 
                  onClick={() => handleEvaluate()} 
                  disabled={!canSubmit || estimatedLines > 30} 
                  className={`w-full md:w-auto py-4 px-10 font-black uppercase tracking-widest shadow-xl transition-all ${(canSubmit && estimatedLines <= 30) ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/30 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
               >
                  Enviar Relatório de Batalha
               </Button>
            </div>
          </div>
        </div>
      )}

      {/* RESULTADO DA BATALHA */}
      {step === 'RESULT' && result && (
        <div className="space-y-8 animate-fade-in pb-20 max-w-3xl mx-auto text-center mt-10">
          <h2 className="text-4xl font-black uppercase text-white mb-8">Veredito do Chefão</h2>
          
          <div className={`p-10 rounded-3xl border-4 shadow-2xl ${result.totalScore >= targetScore ? 'bg-emerald-900/30 border-emerald-500 shadow-emerald-500/30' : 'bg-red-900/30 border-red-500 shadow-red-500/30'}`}>
             <div className="text-[8rem] font-black leading-none text-white drop-shadow-lg mb-4">{result.totalScore}</div>
             <Badge color={result.totalScore >= targetScore ? 'green' : 'red'} className="text-lg px-6 py-2">
                {result.totalScore >= targetScore ? "PRÉDIO DOMINADO 🏆" : "BATALHA PERDIDA 💀"}
             </Badge>
             <p className="mt-6 text-slate-300 font-medium">Meta do Prédio: {targetScore} pontos</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm text-left">
             <h3 className="text-lg font-black text-white mb-4">Análise Tática</h3>
             <p className="text-slate-400 italic mb-4">"{result.generalFeedback}"</p>
             <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl">
                <div>
                   <p className="text-[10px] text-emerald-400 uppercase font-black">Maior Força</p>
                   <p className="text-sm text-white">{result.strengths[0]}</p>
                </div>
             </div>
          </div>

          <Button 
              onClick={handleClaimBuilding} 
              loading={isSaving}
              className={`w-full py-6 text-xl font-black tracking-widest uppercase shadow-2xl ${result.totalScore >= targetScore ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
          >
              {result.totalScore >= targetScore ? 'Reivindicar Torre e Avançar' : 'Aceitar Derrota e Voltar'}
          </Button>
        </div>
      )}
    </div>
  );
}