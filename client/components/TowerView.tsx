import React, { useEffect, useState, useRef } from 'react';
import { Button, LoadingSpinner, Badge } from './UIComponents';
import { Sword, Lock, Star } from 'lucide-react';
import { getTowerQuestionCount } from './QuizScreen'; // Usado para exibição visual

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface TowerViewProps { onBack: () => void; onBattleStart: (floor: any) => void; }

const DISTRICTS = [
    { name: "Distrito Inicial", end: 9, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
    { name: "Cidade Base", end: 24, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30" },
    { name: "Zona Intermediária", end: 44, color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/30" },
    { name: "Cidade Elite", end: 69, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30" },
    { name: "Complexo Nacional", end: 89, color: "text-slate-200", bg: "bg-slate-800", border: "border-slate-600" },
    { name: "Torre Suprema", end: 99, color: "text-yellow-400", bg: "bg-black", border: "border-yellow-500/30" },
    { name: "Torre dos 1000 Pontos", end: 100, color: "text-red-500", bg: "bg-red-900", border: "border-red-500/50" }
];

function getDistrict(bNum: number) { return DISTRICTS.find(dist => bNum <= dist.end) || DISTRICTS[0]; }

// Cálculo universal para renderizar a Meta de Acerto baseada no prédio
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
        // Limpa resíduos de batalhas antigas ao montar
        sessionStorage.removeItem('studr_exam_mode');
        sessionStorage.removeItem('studr_current_tower_floor');
        
        const fetchTower = async () => {
            try {
                const res = await fetch(`${API_URL}/api/tower/state`, { 
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('studr_token')}` },
                    cache: 'no-store' // 🚨 EVITA CACHE DO NAVEGADOR
                });
                if(!res.ok) throw new Error("Erro na API da Torre");
                const data = await res.json();
                setTower(data);
            } catch (err) { 
                console.error(err); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchTower();
    }, []);

    useEffect(() => {
        if (!loading && tower) {
            window.scrollTo(0, 0);
            const timer = setTimeout(() => { currentBuildingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 1000);
            return () => clearTimeout(timer);
        }
    }, [loading, tower]);

    const handleBattle = async (floorData: any) => {
        setBattlingId(floorData.id);
        const enrichedFloorData = { ...floorData, questionsCount: getTowerQuestionCount(floorData.building) };
        setTimeout(() => { onBattleStart(enrichedFloorData); }, 800);
    };

    if (loading) return <div className="flex justify-center items-center h-[60vh]"><LoadingSpinner size="md" /></div>;

    // A fonte da verdade sobre onde o jogador está vem exclusivamente destas duas variáveis
    const highestBuilding = tower?.currentBuilding || 1;
    const currentFloorNum = tower?.currentFloor || 1;
    const dbFloors = tower?.floors || [];
    
    // Gera todos os prédios de 100 até 1 (renderiza de cima para baixo)
    const ALL_BUILDINGS = Array.from({ length: 100 }, (_, i) => 100 - i);

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in relative pb-32 min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* HUD TOPO */}
            <div className="flex justify-between items-center mb-12 sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-50 p-4 rounded-b-3xl shadow-sm border-b border-slate-200 dark:border-slate-800">
                <Button variant="outline" onClick={onBack} className="rounded-xl border-2">← Sair</Button>
                <div className="text-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Mundo Atual</span>
                    <h1 className="text-xl font-black text-slate-800 dark:text-white uppercase">Prédio {highestBuilding}</h1>
                </div>
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20">
                        <Star size={14} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-xs font-black text-yellow-600">Torre</span>
                    </div>
                </div>
            </div>

            {/* MAPA DOS PRÉDIOS */}
            <div className="flex flex-col gap-8 relative pb-20">
                <div className="absolute w-2 h-[98%] bg-slate-200 dark:bg-slate-800 left-16 md:left-[140px] top-10 z-0 rounded-full"></div>

                {ALL_BUILDINGS.map((bId) => {
                    const isBuildingUnlocked = bId <= highestBuilding;
                    const isBuildingCurrent = bId === highestBuilding;
                    
                    const district = getDistrict(bId);
                    const qCount = getTowerQuestionCount(bId);
                    const isLastOfDistrict = DISTRICTS.some(d => d.end === bId);
                    const averageTargetScore = calculateTargetScoreForBuilding(bId);

                    return (
                        <React.Fragment key={bId}>
                            {/* CAIXA DE DISTRITO */}
                            {isLastOfDistrict && bId !== 100 && (
                                <div className={`w-full py-6 my-6 text-center rounded-3xl border-2 ${district.bg} ${district.border} opacity-90 backdrop-blur-sm z-10`}>
                                    <h2 className={`text-2xl md:text-4xl font-black uppercase tracking-widest ${district.color}`}>{district.name}</h2>
                                    <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs mt-1">Nível de Pressão Escalando</p>
                                </div>
                            )}
                            
                            {/* CHEFÃO FINAL 100 */}
                            {bId === 100 && (
                                <div className="w-full py-12 mb-10 text-center rounded-3xl bg-gradient-to-r from-red-600 to-amber-900 border-4 border-yellow-500 shadow-[0_0_50px_rgba(239,68,68,0.5)] z-10">
                                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white drop-shadow-lg">Torre dos 1000 Pontos</h2>
                                    <p className="text-yellow-200 font-black uppercase tracking-widest mt-2 text-sm">O Julgamento Final - Simulado ENEM Completo</p>
                                </div>
                            )}

                            {/* LINHA DO PRÉDIO */}
                            <div ref={isBuildingCurrent ? currentBuildingRef : null} className={`relative flex flex-col md:flex-row items-start md:items-center gap-6 ${!isBuildingUnlocked ? 'opacity-40 grayscale' : 'z-20'}`}>
                                
                                {/* CAIXA DE INFORMAÇÃO DO PRÉDIO ESQUERDA */}
                                <div className={`w-32 flex-shrink-0 flex flex-col items-center justify-center ${isBuildingCurrent ? 'scale-110 transform transition-all drop-shadow-2xl' : ''}`}>
                                    <div className={`w-24 h-24 md:w-32 md:h-32 rounded-3xl flex flex-col items-center justify-center border-4 shadow-xl ${isBuildingUnlocked ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-indigo-400' : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 shadow-none'}`}>
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Prédio</span>
                                        <span className={`text-4xl md:text-5xl font-black ${isBuildingUnlocked ? 'text-white' : 'text-slate-400'}`}>{bId}</span>
                                    </div>
                                    <div className="mt-3 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1 rounded-xl shadow-sm">
                                        <span className="text-[10px] font-black uppercase text-indigo-500 block">{qCount} Questões</span>
                                    </div>
                                    {isBuildingUnlocked && (
                                        <div className="mt-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-xl text-center">
                                            <span className="text-[9px] font-black uppercase text-indigo-400 block tracking-wider">Meta TRI</span>
                                            <span className="text-xs font-black text-indigo-500">{averageTargetScore}</span>
                                        </div>
                                    )}
                                </div>

                                {/* ANDARES DO PRÉDIO DIREITA */}
                                <div className="flex-1 flex flex-wrap gap-4 items-center ml-16 md:ml-0">
                                    {Array.from({ length: 5 }).map((_, i) => {
                                        const floorNum = i + 1;
                                        
                                        // Busca o andar real na base de dados para ver as estrelas
                                        const dbFloor = dbFloors.find((f: any) => f.building === bId && f.floorNumber === floorNum);
                                        
                                        // 🚨 LÓGICA DE PROGRESSÃO BLINDADA 🚨
                                        // Um nó está completo se o prédio for menor que o atual, OU se for o prédio atual E o andar for menor que o atual
                                        const isNodeCompleted = bId < highestBuilding || (bId === highestBuilding && floorNum < currentFloorNum);
                                        
                                        // Um nó é o atual se for o prédio exato E o andar exato
                                        const isNodeCurrent = bId === highestBuilding && floorNum === currentFloorNum;
                                        
                                        // Todos os outros estão trancados
                                        const isNodeLocked = !isNodeCompleted && !isNodeCurrent;

                                        // Mock object a ser enviado para a batalha
                                        const floorPayload = dbFloor || {
                                            id: `mock-${bId}-${floorNum}`,
                                            building: bId,
                                            floorNumber: floorNum,
                                            targetScore: averageTargetScore,
                                            isBoss: floorNum === 5,
                                            area: 'Todas as Áreas',
                                            topic: `Treino Geral do Andar ${floorNum}` // Adicionei isso para a IA não falhar se faltar tópico
                                        };

                                        return (
                                            <div key={floorNum} className="flex flex-col items-center">
                                                <button
                                                    onClick={() => isNodeCurrent && handleBattle(floorPayload)}
                                                    disabled={!isNodeCurrent || battlingId === floorPayload.id}
                                                    className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex flex-col items-center justify-center font-black transition-all transform mt-4
                                                        ${isNodeCompleted ? 'bg-emerald-500 text-white border-b-4 border-emerald-700' : 
                                                        isNodeCurrent ? 'bg-yellow-400 text-yellow-900 border-b-4 border-yellow-600 scale-110 hover:-translate-y-1 animate-pulse shadow-xl shadow-yellow-500/40 cursor-pointer' : 
                                                        'bg-slate-200 dark:bg-slate-800 text-slate-400 border-b-4 border-slate-300 dark:border-slate-700 cursor-not-allowed'}`}
                                                >
                                                    {battlingId === floorPayload.id ? <LoadingSpinner size="sm" /> : 
                                                     isNodeLocked ? <Lock size={20} /> : 
                                                     floorPayload.isBoss ? <Sword size={24} /> : 
                                                     <span className="text-lg md:text-xl">{floorNum}</span>}
                                                    
                                                    {isNodeCompleted && dbFloor?.stars > 0 && (
                                                        <div className="flex gap-0.5 mt-0.5">
                                                            {Array(dbFloor.stars).fill(0).map((_, idx) => <span key={idx} className="text-[6px] md:text-[8px]">⭐</span>)}
                                                        </div>
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}

                <div className="mt-8 z-20 w-full max-w-[200px] mx-auto h-8 bg-slate-300 dark:bg-slate-800 rounded-t-full shadow-inner border-t-4 border-slate-400"></div>
                <div className="z-10 bg-slate-800 text-white px-8 py-3 rounded-full font-black tracking-widest text-sm shadow-xl mx-auto border-4 border-slate-600 -translate-y-4">
                    PONTO DE PARTIDA
                </div>
            </div>
        </div>
    );
}