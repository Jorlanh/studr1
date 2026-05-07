import React, { useEffect, useState } from 'react';
import { Button, LoadingSpinner, Badge, Modal } from './UIComponents';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface TowerViewProps {
    onBack: () => void;
    onBattleStart: (floor: any) => void;
}

export default function TowerView({ onBack, onBattleStart }: TowerViewProps) {
    const [tower, setTower] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [top3Modal, setTop3Modal] = useState<{isOpen: boolean, floorNumber: number, data: any[]}>({isOpen: false, floorNumber: 0, data: []});

    useEffect(() => {
        const fetchTower = async () => {
            try {
                const token = localStorage.getItem('studr_token');
                const res = await fetch(`${API_URL}/api/tower/state`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                setTower(data);
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchTower();
    }, []);

    const fetchTop3 = async (floorNumber: number) => {
        const token = localStorage.getItem('studr_token');
        const res = await fetch(`${API_URL}/api/tower/top3/${floorNumber}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        setTop3Modal({ isOpen: true, floorNumber, data });
    };

    if (loading) return <div className="flex justify-center items-center h-[60vh]"><LoadingSpinner /></div>;

    const floors = tower?.floors || [];
    const reversedFloors = [...floors].reverse();

    return (
        <div className="max-w-2xl mx-auto p-4 animate-fade-in relative pb-32">
            <div className="flex justify-between items-center mb-10 sticky top-0 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-md z-50 py-4 border-b border-slate-200 dark:border-slate-800">
                <Button variant="outline" onClick={onBack}>← Sair</Button>
                <h1 className="text-2xl font-black text-slate-800 dark:text-white uppercase">A Escalada</h1>
                <Badge color="blue">Andar {tower?.highestFloor}</Badge>
            </div>

            <div className="relative flex flex-col items-center mt-6">
                <div className="absolute w-3 h-full bg-slate-200 dark:bg-slate-800 left-1/2 -translate-x-1/2 z-0 rounded-full"></div>

                {reversedFloors.map((floor: any, index: number) => {
                    const isUnlocked = floor.floorNumber <= tower.highestFloor;
                    const isCurrent = floor.floorNumber === tower.highestFloor;
                    const predioNumber = Math.ceil(floor.floorNumber / 5);
                    const isFirstFloorOfPredio = floor.floorNumber % 5 === 1;

                    let cardStyle = "bg-slate-100 dark:bg-slate-900 border-slate-300 opacity-60 grayscale";
                    if (isUnlocked) {
                        if (floor.completed) cardStyle = "bg-green-50 border-green-500 shadow-md";
                        else if (isCurrent) cardStyle = "bg-blue-50 border-blue-500 scale-105 shadow-[0_0_20px_rgba(59,130,246,0.5)] ring-4 ring-blue-500/20";
                        else if (floor.isBoss) cardStyle = "bg-red-50 border-red-500 shadow-md";
                        else cardStyle = "bg-white dark:bg-slate-800 border-slate-300 shadow-md hover:-translate-y-1";
                    }

                    return (
                        <React.Fragment key={floor.id}>
                            {/* Marcador de Novo Prédio (Mundo) no topo de cada bloco de 5 */}
                            {floor.floorNumber % 5 === 0 && (
                                <div className="z-10 bg-slate-800 text-white px-6 py-2 rounded-full font-black tracking-widest text-sm shadow-xl my-6 border-2 border-slate-600">
                                    PRÉDIO {predioNumber}
                                </div>
                            )}

                            <div className="relative z-10 my-4 w-full flex justify-center">
                                <div className={`w-11/12 sm:w-2/3 md:w-3/5 rounded-3xl border-4 p-5 transition-all duration-300 text-left relative overflow-hidden ${cardStyle}`}>
                                    
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h3 className="font-black text-xl text-slate-800 dark:text-white">Andar {floor.floorNumber}</h3>
                                            <Badge color={floor.isBoss ? 'red' : 'blue'} className="mt-1">
                                                {floor.isBoss ? 'CHEFÃO (Redação)' : floor.area}
                                            </Badge>
                                        </div>
                                        
                                        <div className="flex-shrink-0">
                                            {!isUnlocked ? <span className="text-3xl">🔒</span> : 
                                             floor.completed ? (
                                                <div className="flex text-yellow-400 text-sm bg-white dark:bg-slate-800 px-2 py-1 rounded-full border">
                                                    {Array(floor.stars).fill('⭐').map((s,i) => <span key={i}>{s}</span>)}
                                                </div>
                                            ) : <span className="text-3xl animate-bounce drop-shadow-md">⚔️</span>}
                                        </div>
                                    </div>
                                    
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-400 mt-2">{floor.topic}</p>
                                    
                                    <div className="mt-4 pt-3 border-t border-slate-300/50 flex justify-between items-center">
                                        <span className="text-[11px] font-black uppercase text-slate-500">Meta Mínima: {floor.type === 'ESSAY' ? `Nota ${floor.targetScore}` : `TRI ${floor.targetScore}`}</span>
                                    </div>

                                    {isUnlocked && (
                                        <div className="mt-4 flex gap-2">
                                            <Button onClick={() => onBattleStart(floor)} className={`w-full py-2 ${floor.completed ? 'bg-slate-300 text-slate-700' : 'bg-blue-600 text-white'}`}>
                                                {floor.completed ? 'Rejogar' : 'Batalhar'}
                                            </Button>
                                            {floor.isBoss && floor.completed && (
                                                <Button onClick={() => fetchTop3(floor.floorNumber)} variant="outline" className="px-3 border-yellow-400 text-yellow-600">🏆</Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Modal de Top 3 */}
            <Modal isOpen={top3Modal.isOpen} onClose={() => setTop3Modal({...top3Modal, isOpen: false})} title={`🏆 Top 3 - Chefão do Prédio ${Math.ceil(top3Modal.floorNumber/5)}`}>
                <div className="p-4 space-y-3">
                    {top3Modal.data.length === 0 ? <p className="text-center text-slate-500">Ninguém derrotou este chefão ainda!</p> : 
                     top3Modal.data.map(user => (
                        <div key={user.position} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{user.position === 1 ? '🥇' : user.position === 2 ? '🥈' : '🥉'}</span>
                                <span className="font-bold text-slate-800 dark:text-white">{user.name}</span>
                            </div>
                            <span className="font-black text-enem-blue">{user.score} pts</span>
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
}