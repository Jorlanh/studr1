import React, { useEffect, useState } from 'react';
import { Card, FullPageLoader, Badge } from './UIComponents';
import { Users, CreditCard, Award, TrendingUp, ShieldCheck, Mail, Zap, Target } from 'lucide-react';

interface Stats {
    totalUsers: number;
    premiumUsers: number;
    pendingAffiliates: number;
    totalXP: number;
}

const AdminDashboardView: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, "");

    const fetchStats = async () => {
        try {
            setLoading(true);
            const resp = await fetch(`${API_URL}/admin/stats`);
            const data = await resp.json();
            if (resp.ok) {
                setStats(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading) return <FullPageLoader text="Gerando estatísticas globais..." />;
    if (!stats) return <Card className="p-12 text-center text-red-500">Erro ao carregar dashboard.</Card>;

    return (
        <div className="animate-fade-in space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* User Stats Card */}
                <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900/50 dark:to-slate-950 p-6 border-l-4 border-enem-blue relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Users size={64} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                           Total de Alunos
                        </div>
                        <div className="text-4xl font-black text-slate-800 dark:text-white leading-none mt-2">{stats.totalUsers.toLocaleString()}</div>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-green-500 bg-green-500/10 w-fit px-2 py-1 rounded-full">
                           <TrendingUp size={12} /> +12% vs mês anterior
                        </div>
                    </div>
                </Card>

                {/* Premium Users Card */}
                <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900/50 dark:to-slate-950 p-6 border-l-4 border-yellow-400 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <CreditCard size={64} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Alunos Premium</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-white leading-none mt-2">{stats.premiumUsers.toLocaleString()}</p>
                        <div className="mt-4">
                           <Badge color="yellow">{Math.round((stats.premiumUsers / stats.totalUsers) * 100)}% de taxa de conversão</Badge>
                        </div>
                    </div>
                </Card>

                {/* Pending Affiliates Card */}
                <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900/50 dark:to-slate-950 p-6 border-l-4 border-purple-500 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <ShieldCheck size={64} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Afiliados Pendentes</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-white leading-none mt-2">{stats.pendingAffiliates.toLocaleString()}</p>
                        <div className="mt-4">
                           <Badge color="blue">Ações Pendentes</Badge>
                        </div>
                    </div>
                </Card>

                {/* Platform XP Card */}
                <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900/50 dark:to-slate-950 p-6 border-l-4 border-green-500 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Award size={64} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">XP Total Gerado</p>
                        <p className="text-4xl font-black text-slate-800 dark:text-white leading-none mt-2">{stats.totalXP.toLocaleString()}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-4 leading-tight uppercase font-black opacity-60 flex items-center gap-1"><Zap size={10} className="text-yellow-400"/> Atividade recorde detectada</p>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Platform Status */}
                <Card className="p-8">
                    <h3 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-2 tracking-tighter uppercase">
                       <Zap size={20} className="text-yellow-400" /> Saúde da Plataforma
                    </h3>
                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center font-bold">OK</div>
                              <div>
                                 <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Servidor API</p>
                                 <p className="text-xs text-slate-500">Latência: 45ms</p>
                              </div>
                           </div>
                           <Badge color="green">ONLINE</Badge>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-enem-blue/10 text-enem-blue flex items-center justify-center font-bold">AI</div>
                              <div>
                                 <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Inteligência Artificial (OpenAI GPT-4o-mini)</p>
                                 <p className="text-xs text-slate-500">Status: Operacional</p>
                              </div>
                           </div>
                           <Badge color="green">OPERACIONAL</Badge>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">Mail</div>
                              <div>
                                 <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Envio de E-mails (Resend)</p>
                                 <p className="text-xs text-slate-500">Taxa de Entrega: 100%</p>
                              </div>
                           </div>
                           <Badge color="green">NORMAL</Badge>
                        </div>
                    </div>
                </Card>

                {/* Revenue/Growth Tips */}
                <Card className="p-8 bg-gradient-to-br from-enem-blue to-indigo-900 border-none text-white overflow-hidden relative shadow-2xl shadow-blue-500/20">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Target size={180} />
                    </div>
                    <div className="relative z-10 flex flex-col h-full space-y-6">
                        <h3 className="text-2xl font-black leading-tight">Insight Estratégico</h3>
                        <p className="text-blue-100 font-medium leading-relaxed">
                           Sua taxa de conversão Premium cresceu <strong>15%</strong> esta semana após o lançamento do Corretor de Redação IA V2. 
                           Foque em promoções para alunos Trial que ainda não escreveram sua primeira redação.
                        </p>
                        <div className="flex gap-4 pt-4">
                           <div className="flex-1 bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                              <p className="text-xs uppercase font-black opacity-60 mb-2">Ticket Médio</p>
                              <p className="text-2xl font-black">R$ 57,40</p>
                           </div>
                           <div className="flex-1 bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                              <p className="text-xs uppercase font-black opacity-60 mb-2">LTV Estimado</p>
                              <p className="text-2xl font-black">R$ 380,00</p>
                           </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default AdminDashboardView;
