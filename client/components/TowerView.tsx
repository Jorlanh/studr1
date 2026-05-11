import React, { useEffect, useState, useRef } from 'react';
import { Button, LoadingSpinner, Badge } from './UIComponents';
import { Sword, Lock, Star, Target, TrendingUp, RotateCcw } from 'lucide-react';
import { getTowerQuestionCount } from './QuizScreen'; 

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface TowerViewProps { onBack: () => void; onBattleStart: (floor: any) => void; }

// PALETA DE CORES CYBER-INDUSTRIAL
const DISTRICTS = [
    { name: "Distrito Inicial", end: 9, color: "text-cyan-400", bg: "bg-cyan-500/5", border: "border-cyan-500/20", glow: "shadow-[0_0_20px_rgba(34,211,238,0.1)]" },
    { name: "Cidade Base", end: 24, color: "text-blue-400", bg: "bg-blue-500/5", border: "border-blue-500/20", glow: "shadow-[0_0_20px_rgba(59,130,246,0.1)]" },
    { name: "Zona Intermediária", end: 44, color: "text-purple-400", bg: "bg-purple-500/5", border: "border-purple-500/20", glow: "shadow-[0_0_20px_rgba(168,85,247,0.1)]" },
    { name: "Cidade Elite", end: 69, color: "text-fuchsia-400", bg: "bg-fuchsia-500/5", border: "border-fuchsia-500/20", glow: "shadow-[0_0_20px_rgba(232,121,249,0.1)]" },
    { name: "Complexo Nacional", end: 89, color: "text-slate-200", bg: "bg-slate-900/50", border: "border-slate-700", glow: "" },
    { name: "Torre Suprema", end: 99, color: "text-yellow-400", bg: "bg-black/80", border: "border-yellow-500/30", glow: "shadow-[0_0_30px_rgba(234,179,8,0.1)]" },
    { name: "Torre dos 1000 Pontos", end: 100, color: "text-red-500", bg: "bg-gradient-to-b from-red-950/20 to-black", border: "border-red-500/40", glow: "shadow-[0_0_40px_rgba(239,68,68,0.2)]" }
];

// 🚨 CORREÇÃO DO ERRO TYPESCRIPT: FUNÇÃO ADICIONADA
function getDistrict(bNum: number) { 
    return DISTRICTS.find(dist => bNum <= dist.end) || DISTRICTS[0]; 
}

function calculateTargetScoreForBuilding(buildingNum: number) {
    const baseScore = 400;
    const maxScore = 950;
    const increment = (maxScore - baseScore) / 100;
    return Math.floor(baseScore + (buildingNum * increment));
}

export default function TowerView({ onBack, onBattleStart }: TowerViewProps) {
    const [tower, setTower] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [battlingId, setBattlingId] = useState<string | null>(null);
    const currentBuildingRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        sessionStorage.removeItem('studr_exam_mode');
        sessionStorage.removeItem('studr_current_tower_floor');
        
        const fetchTower = async () => {
            try {
                const res = await fetch(`${API_URL}/api/tower/state`, { 
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('studr_token')}` },
                    cache: 'no-store'
                });
                if(!res.ok) throw new Error("Erro na API da Torre");
                const data = await res.json();
                setTower(data);
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchTower();
    }, []);

    useEffect(() => {
        if (!loading && tower) {
            window.scrollTo(0, 0);
            const timer = setTimeout(() => { currentBuildingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 800);
            return () => clearTimeout(timer);
        }
    }, [loading, tower]);

    const handleBattle = async (floorData: any) => {
        setBattlingId(floorData.id);
        const enrichedFloorData = { ...floorData, questionsCount: getTowerQuestionCount(floorData.building) };
        setTimeout(() => { onBattleStart(enrichedFloorData); }, 800);
    };

    if (loading) return <div className="flex justify-center items-center h-[60vh]"><LoadingSpinner size="md" /></div>;

    const highestBuilding = tower?.currentBuilding || 1;
    const currentFloorNum = tower?.currentFloor || 1;
    const dbFloors = tower?.floors || [];
    const ALL_BUILDINGS = Array.from({ length: 100 }, (_, i) => 100 - i);

    return (
        <div className="max-w-5xl mx-auto p-4 animate-fade-in pb-32 min-h-screen dark:bg-slate-950 selection:bg-cyan-500/30">
            {/* STICKY HEADER - APPLE/GLASS STYLE */}
            <div className="flex justify-between items-center mb-16 sticky top-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl z-50 p-5 rounded-3xl shadow-2xl border border-white/20 dark:border-slate-800/50">
                <Button variant="outline" onClick={onBack} className="rounded-2xl border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">← Sair</Button>
                <div className="text-center">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] block mb-1">Localização</span>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">PRÉDIO {highestBuilding}</h1>
                </div>
                <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800/50 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <Star size={16} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-black text-slate-700 dark:text-slate-200">Jornada TRI</span>
                </div>
            </div>

            <div className="flex flex-col gap-12 relative">
                {/* LINHA DE PROGRESSÃO CENTRAL */}
                <div className="absolute w-1 h-[98%] bg-gradient-to-b from-transparent via-slate-200 dark:via-slate-800 to-transparent left-12 md:left-[180px] top-10 z-0"></div>

                {ALL_BUILDINGS.map((bId) => {
                    const isBuildingUnlocked = bId <= highestBuilding;
                    const isBuildingCurrent = bId === highestBuilding;
                    const district = getDistrict(bId);
                    const qCount = getTowerQuestionCount(bId);
                    const isLastOfDistrict = DISTRICTS.some(d => d.end === bId);
                    const targetScore = calculateTargetScoreForBuilding(bId);

                    const buildingFloors = dbFloors.filter((f: any) => f.building === bId);
                    const completedInBldg = buildingFloors.filter((f: any) => f.isCompleted);
                    const avgScore = completedInBldg.length > 0 
                        ? Math.round(completedInBldg.reduce((acc: number, f: any) => acc + (f.highScore || 0), 0) / completedInBldg.length)
                        : null;

                    return (
                        <React.Fragment key={bId}>
                            {isLastOfDistrict && bId !== 100 && (
                                <div className={`w-full py-8 my-4 text-center rounded-[2.5rem] border ${district.bg} ${district.border} ${district.glow} z-10 transition-all`}>
                                    <h2 className={`text-3xl md:text-5xl font-black uppercase tracking-tighter ${district.color}`}>{district.name}</h2>
                                    <Badge color="blue" className="mt-3 opacity-60 uppercase text-[10px] tracking-widest">Setor Desbloqueado</Badge>
                                </div>
                            )}

                            {bId === 100 && (
                                <div className="w-full py-12 mb-10 text-center rounded-3xl bg-gradient-to-b from-red-950/20 to-black border-4 border-yellow-500 shadow-[0_0_50px_rgba(239,68,68,0.5)] z-10">
                                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white drop-shadow-lg">Torre dos 1000 Pontos</h2>
                                    <p className="text-yellow-200 font-black uppercase tracking-widest mt-2 text-sm">O Julgamento Final - Simulado ENEM Completo</p>
                                </div>
                            )}

                            <div ref={isBuildingCurrent ? currentBuildingRef : null} 
                                 className={`relative flex flex-col md:flex-row items-start md:items-stretch gap-8 ${!isBuildingUnlocked ? 'opacity-30 grayscale scale-95 pointer-events-none' : 'z-20'}`}>
                                
                                {/* CARD DO PRÉDIO - ESTILO APPLE/INDUSTRIAL */}
                                <div className={`w-40 md:w-48 flex-shrink-0 flex flex-col p-6 rounded-[2rem] border-2 transition-all duration-500
                                    ${isBuildingCurrent ? 'bg-slate-900 border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.2)]' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'}`}>
                                    
                                    <div className="flex flex-col items-center text-center mb-6">
                                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Building</span>
                                        <span className={`text-5xl font-black ${isBuildingCurrent ? 'text-white' : 'text-slate-400 dark:text-slate-600'}`}>{bId}</span>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex flex-col gap-1 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                                            <div className="flex items-center gap-1.5 opacity-80">
                                                <Target size={10} className="text-cyan-500" />
                                                <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500">Meta TRI</span>
                                            </div>
                                            <span className="text-sm font-black text-slate-700 dark:text-slate-200">{targetScore}</span>
                                        </div>

                                        {avgScore !== null && (
                                            <div className={`flex flex-col gap-1 p-3 rounded-2xl border transition-colors
                                                ${avgScore >= targetScore ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                                                <div className="flex items-center gap-1.5 opacity-90">
                                                    <TrendingUp size={10} className={avgScore >= targetScore ? 'text-emerald-500' : 'text-amber-500'} />
                                                    <span className={`text-[8px] font-black uppercase tracking-tighter ${avgScore >= targetScore ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>Sua Média</span>
                                                </div>
                                                <span className={`text-sm font-black ${avgScore >= targetScore ? 'text-emerald-500' : 'text-amber-500'}`}>{avgScore}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{qCount} Questões</span>
                                        <div className={`w-2 h-2 rounded-full ${isBuildingCurrent ? 'bg-cyan-500 animate-pulse' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                    </div>
                                </div>

                                {/* LISTA DE ANDARES COM OPÇÃO DE REPLAY */}
                                <div className="flex-1 flex flex-wrap content-center gap-6 ml-16 md:ml-0 pt-4 md:pt-0">
                                    {Array.from({ length: 5 }).map((_, i) => {
                                        const fNum = i + 1;
                                        const dbF = dbFloors.find((f: any) => f.building === bId && f.floorNumber === fNum);
                                        
                                        const isDone = dbF?.isCompleted || (bId < highestBuilding || (bId === highestBuilding && fNum < currentFloorNum));
                                        const isActive = bId === highestBuilding && fNum === currentFloorNum;
                                        const isLocked = !isDone && !isActive;

                                        const floorPayload = dbF || {
                                            id: `mock-${bId}-${fNum}`,
                                            building: bId,
                                            floorNumber: fNum,
                                            targetScore: targetScore,
                                            isBoss: fNum === 5,
                                            area: 'Todas as Áreas',
                                            topic: `Treino Geral do Andar ${fNum}`
                                        };

                                        return (
                                            <div key={fNum} className="flex flex-col items-center group">
                                                {/* 🚨 CORREÇÃO: BOTÃO ATIVO PARA REFAZER (isDone || isActive) 🚨 */}
                                                <button
                                                    onClick={() => (isActive || isDone) && handleBattle(floorPayload)}
                                                    disabled={isLocked || battlingId === floorPayload.id}
                                                    title={isDone ? "Refazer este andar" : ""}
                                                    className={`w-16 h-16 md:w-20 md:h-20 rounded-3xl flex flex-col items-center justify-center font-black transition-all duration-300 relative
                                                        ${isDone ? 'bg-white dark:bg-slate-900 border-2 border-emerald-500 text-emerald-500 shadow-[0_10px_20px_rgba(16,185,129,0.1)] hover:border-emerald-400 cursor-pointer hover:-translate-y-1' : 
                                                          isActive ? 'bg-cyan-500 text-white shadow-[0_15px_30px_rgba(6,182,212,0.3)] scale-110 -translate-y-2 cursor-pointer' : 
                                                          'bg-slate-100 dark:bg-slate-800/50 text-slate-300 dark:text-slate-700 border-2 border-transparent cursor-not-allowed'}`}
                                                >
                                                    {battlingId === floorPayload.id ? <LoadingSpinner size="sm" /> : 
                                                     isLocked ? <Lock size={18} className="opacity-40" /> : 
                                                     floorPayload.isBoss ? <Sword size={24} /> : <span className="text-xl">{fNum}</span>}
                                                    
                                                    {/* Ícone de Replay invisível até o Hover */}
                                                    {isDone && !battlingId && (
                                                        <div className="absolute -top-2 -right-2 bg-emerald-100 dark:bg-emerald-900/50 p-1.5 rounded-full text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                                                            <RotateCcw size={12} strokeWidth={3} />
                                                        </div>
                                                    )}

                                                    {isDone && dbF?.stars > 0 && (
                                                        <div className="absolute -bottom-2.5 flex gap-0.5">
                                                            {Array(dbF.stars).fill(0).map((_, idx) => (
                                                                <div key={idx} className="bg-emerald-500 p-0.5 rounded-sm shadow-md">
                                                                    <Star size={8} className="fill-white text-white" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </button>
                                                
                                                {/* PONTUAÇÃO DO ANDAR ABAIXO DO BOTÃO */}
                                                {isDone && dbF?.highScore !== undefined && (
                                                    <span className="mt-5 text-[10px] font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                                        {dbF.highScore} PTS
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}

                <div className="mt-20 flex flex-col items-center opacity-50">
                    <div className="w-1 h-12 bg-gradient-to-b from-slate-200 dark:from-slate-800 to-transparent"></div>
                    <div className="bg-slate-200 dark:bg-slate-800 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Início da Evolução
                    </div>
                </div>
            </div>
        </div>
    );
}