import React, { useEffect, useState } from 'react';
import { Button, LoadingSpinner, Badge, Modal } from './UIComponents';
import { Sword, Lock, Trophy, Star } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface TowerViewProps {
    onBack: () => void;
    onBattleStart: (floor: any) => void;
}

export default function TowerView({ onBack, onBattleStart }: TowerViewProps) {
    const [tower, setTower] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [battlingId, setBattlingId] = useState<string | null>(null);
    const [top3Modal, setTop3Modal] = useState<{isOpen: boolean, floorNumber: number, data: any[]}>({isOpen: false, floorNumber: 0, data: []});

    useEffect(() => {
        const fetchTower = async () => {
            try {
                const token = localStorage.getItem('studr_token');
                const res = await fetch(`${API_URL}/api/tower/state`, { 
                    headers: { 'Authorization': `Bearer ${token}` } 
                });
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

    const fetchTop3 = async (floorNumber: number) => {
        const token = localStorage.getItem('studr_token');
        const res = await fetch(`${API_URL}/api/tower/top3/${floorNumber}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        setTop3Modal({ isOpen: true, floorNumber, data });
    };

    const handleBattle = async (floor: any) => {
        setBattlingId(floor.id);
        // Feedback visual imediato antes de navegar
        setTimeout(() => {
            onBattleStart(floor);
        }, 800);
    };

    if (loading) return <div className="flex justify-center items-center h-[60vh]"><LoadingSpinner size="md" /></div>;

    const floors = tower?.floors || [];
    const highestFloor = tower?.highestFloor || 1;
    
    // O prédio atual que o usuário está (1 a 5 = Prédio 1, 6 a 10 = Prédio 2...)
    const currentBuilding = Math.ceil(highestFloor / 5);
    const maxFloorToShow = currentBuilding * 5;
    const minFloorToShow = ((currentBuilding - 1) * 5) + 1;

    // Criamos o array de andares do prédio, e fazemos um reverse
    // Assim, no map, o andar maior (ex: 5) renderiza PRIMEIRO no topo da tela, 
    // e o andar menor (ex: 1) renderiza por ÚLTIMO na base da tela. A verdadeira escalada!
    const buildingFloors = [];
    for (let i = maxFloorToShow; i >= minFloorToShow; i--) {
        const realFloor = floors.find((f: any) => f.floorNumber === i);
        buildingFloors.push(realFloor || { floorNumber: i, locked: true, topic: 'Desafio Trancado', type: i % 5 === 0 ? 'ESSAY' : 'QUIZ', isBoss: i % 5 === 0 });
    }

    return (
        <div className="max-w-2xl mx-auto p-4 animate-fade-in relative pb-32 min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-50 p-4 rounded-b-3xl shadow-sm border-b border-slate-200 dark:border-slate-800">
                <Button variant="outline" onClick={onBack} className="rounded-xl border-2">← Sair</Button>
                <div className="text-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Mundo Atual</span>
                    <h1 className="text-xl font-black text-slate-800 dark:text-white uppercase">Prédio {currentBuilding}</h1>
                </div>
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20">
                        <Star size={14} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-xs font-black text-yellow-600">Torre</span>
                    </div>
                </div>
            </div>

            <div className="relative flex flex-col items-center">
                {/* Linha Central da Torre conectando os andares */}
                <div className="absolute w-4 h-full bg-slate-200 dark:bg-slate-800 left-1/2 -translate-x-1/2 z-0 rounded-full"></div>

                {buildingFloors.map((floor: any, index: number) => {
                    const isUnlocked = floor.floorNumber <= highestFloor && !floor.locked;
                    const isCurrent = floor.floorNumber === highestFloor;
                    const isCompleted = floor.completed;
                    const isBoss = floor.isBoss;

                    // Alternamos o lado que a descrição do andar aparece (Zig-Zag de Cards)
                    const isLeftAligned = index % 2 === 0;

                    let cardStyle = "bg-slate-100 dark:bg-slate-900 border-slate-300 opacity-60 grayscale";
                    let nodeStyle = "bg-slate-300 text-slate-500 border-slate-400";
                    
                    if (isUnlocked) {
                        if (isCompleted) {
                            cardStyle = "bg-green-50 dark:bg-green-900/10 border-green-500 shadow-md";
                            nodeStyle = "bg-green-500 text-white border-green-700 shadow-green-500/50 shadow-lg";
                        } else if (isCurrent) {
                            cardStyle = "bg-blue-50 dark:bg-blue-900/20 border-enem-blue shadow-[0_0_20px_rgba(0,74,173,0.3)] ring-2 ring-enem-blue/30 scale-105";
                            nodeStyle = "bg-enem-blue text-white border-blue-800 shadow-[0_0_20px_rgba(0,74,173,0.6)] animate-pulse ring-4 ring-blue-400/30 scale-110";
                        } else if (isBoss) {
                            cardStyle = "bg-red-50 dark:bg-red-900/10 border-red-500 shadow-md";
                            nodeStyle = "bg-red-500 text-white border-red-700 shadow-red-500/50 shadow-lg";
                        }
                    }

                    return (
                        <div key={floor.floorNumber} className="relative z-10 my-8 w-full flex justify-center items-center">
                            
                            {/* Card de Detalhes (Esquerda ou Direita dependendo do Zig-Zag) */}
                            <div className={`hidden md:block absolute w-5/12 transition-all duration-300 ${isLeftAligned ? 'left-0 pr-12 text-right' : 'right-0 pl-12 text-left'}`}>
                                <div className={`p-4 rounded-2xl border-4 ${cardStyle} ${isUnlocked ? 'hover:-translate-y-1' : ''}`}>
                                    <h3 className="font-black text-lg text-slate-800 dark:text-white uppercase">Andar {floor.floorNumber}</h3>
                                    <p className="text-xs font-bold text-slate-500 mb-2">{floor.topic}</p>
                                    
                                    {isUnlocked && (
                                        <div className={`flex flex-col gap-2 mt-3 pt-3 border-t ${isLeftAligned ? 'items-end' : 'items-start'} border-slate-300/50 dark:border-slate-700`}>
                                            <Badge color={isBoss ? 'red' : 'blue'} className="text-[10px]">{isBoss ? 'CHEFÃO' : floor.area}</Badge>
                                            <span className="text-[10px] font-black uppercase text-slate-500 mt-1">META MÍNIMA: <span className="text-enem-blue text-sm">{floor.type === 'ESSAY' ? `Nota ${floor.targetScore}` : `TRI ${floor.targetScore}`}</span></span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* O Node Central (A Bolinha do Nível) */}
                            <div className="relative flex flex-col items-center">
                                {/* Coroa do Boss */}
                                {isBoss && <div className="absolute -top-6 text-3xl animate-bounce drop-shadow-md z-20">👑</div>}

                                <button
                                    disabled={!isUnlocked || battlingId === floor.id}
                                    onClick={() => handleBattle(floor)}
                                    className={`
                                        relative w-24 h-24 rounded-full border-b-[8px] flex items-center justify-center transition-all z-10
                                        ${isUnlocked ? 'active:scale-95 active:border-b-0 active:translate-y-2 cursor-pointer' : 'cursor-not-allowed'}
                                        ${nodeStyle}
                                    `}
                                >
                                    {battlingId === floor.id ? (
                                        <LoadingSpinner size="md" />
                                    ) : !isUnlocked ? (
                                        <Lock size={32} />
                                    ) : isCompleted ? (
                                        <div className="flex flex-col items-center mt-1">
                                            <Trophy size={28} />
                                            <div className="flex gap-0.5 mt-1">
                                                {Array(floor.stars).fill('⭐').map((s, i) => <span key={i} className="text-[10px] drop-shadow-md">⭐</span>)}
                                            </div>
                                        </div>
                                    ) : isBoss ? (
                                        <Sword size={36} />
                                    ) : (
                                        <span className="text-3xl font-black">{floor.floorNumber}</span>
                                    )}
                                </button>

                                {/* Card Mobile (Aparece embaixo do node em telas pequenas) */}
                                <div className={`md:hidden mt-4 w-64 p-4 rounded-2xl border-4 ${cardStyle} flex flex-col items-center text-center`}>
                                    <h3 className="font-black text-lg text-slate-800 dark:text-white uppercase mb-1">Andar {floor.floorNumber}</h3>
                                    <p className="text-xs font-bold text-slate-500 mb-3">{floor.topic}</p>
                                    
                                    {isUnlocked && (
                                        <>
                                            <span className="text-[10px] font-black uppercase text-slate-500 mb-3">META MÍNIMA: <span className="text-enem-blue">{floor.type === 'ESSAY' ? `Nota ${floor.targetScore}` : `TRI ${floor.targetScore}`}</span></span>
                                            <div className="flex gap-2 w-full">
                                                <Button 
                                                    onClick={() => handleBattle(floor)} 
                                                    disabled={battlingId === floor.id}
                                                    className={`w-full py-3 ${isCompleted ? 'bg-slate-700' : 'bg-enem-blue shadow-lg shadow-blue-500/30'}`}
                                                >
                                                    {battlingId === floor.id ? 'Carregando...' : isCompleted ? 'Rejogar Nível' : isBoss ? '⚔️ Batalhar Chefão' : '⚔️ Batalhar'}
                                                </Button>
                                                {isBoss && isCompleted && (
                                                    <Button onClick={() => fetchTop3(floor.floorNumber)} variant="outline" className="px-3 border-yellow-400 text-yellow-600">🏆</Button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Botões auxiliares ao lado do Node (Aparece só no Desktop) */}
                                {isUnlocked && (
                                    <div className="hidden md:flex absolute -right-48 w-40 flex-col gap-2">
                                        <Button 
                                            onClick={() => handleBattle(floor)} 
                                            disabled={battlingId === floor.id}
                                            className={`w-full py-3 shadow-lg ${isCompleted ? 'bg-slate-700' : 'bg-enem-blue shadow-blue-500/30'}`}
                                        >
                                            {battlingId === floor.id ? 'Gerando...' : isCompleted ? 'Rejogar Nível' : isBoss ? '⚔️ Lutar contra Chefão' : '⚔️ Entrar na Batalha'}
                                        </Button>
                                        {isBoss && isCompleted && (
                                            <Button onClick={() => fetchTop3(floor.floorNumber)} variant="outline" className="w-full py-2 border-yellow-400 text-yellow-600 font-bold bg-white dark:bg-slate-900 hover:bg-yellow-50">
                                                🏆 Ver Top 3 da Fase
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                
                {/* A Base do Prédio (Visual) */}
                <div className="mt-8 z-20 w-64 h-8 bg-slate-300 dark:bg-slate-800 rounded-t-full shadow-inner border-t-4 border-slate-400"></div>
                <div className="z-10 bg-slate-800 text-white px-8 py-3 rounded-full font-black tracking-widest text-sm shadow-xl my-4 border-4 border-slate-600 -translate-y-8">
                    {currentBuilding > 1 ? `PRÉDIO ${currentBuilding - 1} COMPLETADO` : 'ENTRADA DA TORRE'}
                </div>
            </div>

            {/* Modal de Top 3 */}
            <Modal isOpen={top3Modal.isOpen} onClose={() => setTop3Modal({...top3Modal, isOpen: false})} title={`🏆 Top 3 - Chefão do Prédio ${Math.ceil(top3Modal.floorNumber/5)}`}>
                <div className="p-4 space-y-3">
                    {top3Modal.data.length === 0 ? <p className="text-center text-slate-500">Ninguém derrotou este chefão ainda!</p> : 
                     top3Modal.data.map(user => (
                        <div key={user.position} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl drop-shadow-md">{user.position === 1 ? '🥇' : user.position === 2 ? '🥈' : '🥉'}</span>
                                <span className="font-bold text-slate-800 dark:text-white uppercase tracking-wider">{user.name}</span>
                            </div>
                            <span className="font-black text-enem-blue bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">{user.score} pts</span>
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
}