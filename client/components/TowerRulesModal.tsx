import React from 'react';
import { Modal, Button } from './UIComponents';
import { Sword, Shield, Clock, TrendingUp, Map, Brain } from 'lucide-react';

interface TowerRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TowerRulesModal({ isOpen, onClose }: TowerRulesModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Regras da Jornada TRI" size="lg">
      <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
        
        {/* Intro */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-4xl shadow-xl mb-4">
            🗼
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
            A Gigantesca Torre da Evolução
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 max-w-sm mx-auto">
            Uma jornada infinita rumo aos 1000 pontos no ENEM. Prepare-se para testar sua resistência mental, gestão de tempo e controle emocional.
          </p>
        </div>

        {/* Section 1: Progressão de Questões */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="text-blue-500" size={24} />
            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase">Escalonamento de Combate</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            A jornada começa leve (5 questões por andar) e escala progressivamente. Não se trata apenas de "mais questões", mas do aumento da <strong>dificuldade cognitiva, complexidade textual e pegadinhas</strong> calculadas pela TRI.
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-medium text-slate-500">
            <li className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1"><span>Início (Prédio 1)</span> <span className="text-blue-500 font-bold">5 Questões</span></li>
            <li className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1"><span>Avançado (Prédio 40)</span> <span className="text-blue-500 font-bold">35 Questões</span></li>
            <li className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1"><span>Elite (Prédio 80)</span> <span className="text-blue-500 font-bold">90 Questões</span></li>
            <li className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1"><span>Julgamento Final (100)</span> <span className="text-red-500 font-black">180 Questões</span></li>
          </ul>
        </div>

        {/* Section 2: Redação Assassina */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="text-red-500" size={24} />
            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase">Redação: Morte Súbita</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            Cada andar final de um prédio é um Chefão: uma <strong>Redação Obrigatória com Tempo Limite</strong>. O tempo encolhe conforme você sobe. Quando o relógio zerar, sua redação é enviada automaticamente, punindo a falta de gestão de tempo.
          </p>
          <div className="flex flex-col gap-2 text-xs font-medium text-slate-500 bg-red-50 dark:bg-red-950/20 p-3 rounded-xl border border-red-100 dark:border-red-900/30">
            <div className="flex justify-between"><span>Prédios Iniciais:</span> <strong>90 Minutos</strong></div>
            <div className="flex justify-between"><span>Prédios Avançados:</span> <strong>50 Minutos</strong></div>
            <div className="flex justify-between text-red-600 dark:text-red-400"><span>Elite Suprema:</span> <strong>30 Minutos (Pressão Extrema)</strong></div>
          </div>
        </div>

        {/* Section 3: Mapa Global e Desbloqueios */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                    <Map className="text-emerald-500" size={20} />
                    <h3 className="text-md font-black text-slate-800 dark:text-white uppercase">Mapa Global</h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                    O percurso é dividido em distritos. Do <em>Distrito Inicial</em> até a imponente <em>Torre dos 1000 Pontos</em>. A cada novo distrito, o ambiente de prova se torna mais hostil.
                </p>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                    <Shield className="text-yellow-500" size={20} />
                    <h3 className="text-md font-black text-slate-800 dark:text-white uppercase">Recompensas</h3>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                    Conquistar prédios garante XP maciço, novos Títulos de Honra, efeitos visuais na sua conta e badges de Elite para dominar o Ranking.
                </p>
            </div>
        </div>

        {/* Cta */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className="text-xs text-slate-500 mb-4 font-bold uppercase tracking-widest">
               "A batalha final de cada prédio moldará sua mente."
            </p>
            <Button onClick={onClose} className="w-full h-12 rounded-xl font-black bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                Entendi as Regras
            </Button>
        </div>

      </div>
    </Modal>
  );
}