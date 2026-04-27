import React, { useEffect, useState } from 'react';
import { Button, Card, LoadingSpinner, Badge, FullPageLoader } from './UIComponents';
import { Check, X, Search, User, Mail, Calendar, ExternalLink, ShieldCheck, Clock, Filter, ChevronRight, Link, Tag } from 'lucide-react';

interface Affiliate {
    id: string;
    name: string;
    email: string;
    affiliateStatus: string;
    createdAt: string;
    phone?: string;
    affiliateLink?: {
        slug: string;
        checkoutMonthly: string;
        discountTypeMonthly: string;
        discountValueMonthly: number;
        checkoutAnnual: string;
        discountTypeAnnual: string;
        discountValueAnnual: number;
        checkoutSimulado: string;
        discountTypeSimulado: string;
        discountValueSimulado: number;
    } | null;
}

interface ProductDiscountForm {
    discountType: 'percent' | 'fixed';
    discountValue: string;
}

interface ApprovalForm {
    slug: string;
    monthly: ProductDiscountForm;
    annual: ProductDiscountForm;
    simulado: ProductDiscountForm;
}

const emptyProduct = (): ProductDiscountForm => ({ discountType: 'percent', discountValue: '0' });

interface AdminAffiliatesViewProps {
    onBack: () => void;
}

const BASE_PRICES = { monthly: 68, annual: 39, simulado: 11.80 };

function calcDisplayPrice(base: number, type: 'percent' | 'fixed', value: number): number {
    if (type === 'percent') return Math.max(0, base * (1 - value / 100));
    return Math.max(0, base - value);
}

const AdminAffiliatesView: React.FC<AdminAffiliatesViewProps> = ({ onBack }) => {
    const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Modal state
    const [approvalTarget, setApprovalTarget] = useState<Affiliate | null>(null);
    const [approvalForm, setApprovalForm] = useState<ApprovalForm>({
        slug: '',
        monthly: emptyProduct(),
        annual: emptyProduct(),
        simulado: emptyProduct(),
    });
    const [approvalLoading, setApprovalLoading] = useState(false);
    const [approvalError, setApprovalError] = useState('');

    const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, "");

    const fetchAffiliates = async () => {
        try {
            setLoading(true);
            const resp = await fetch(`${API_URL}/admin/affiliates`);
            const data = await resp.json();
            if (resp.ok) setAffiliates(data);
            else setError(data.error || 'Erro ao carregar afiliados.');
        } catch {
            setError('Erro de conexão.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAffiliates(); }, []);

    const handleReject = async (id: string) => {
        try {
            const resp = await fetch(`${API_URL}/admin/affiliates/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'rejected' }),
            });
            if (resp.ok) setAffiliates(prev => prev.map(a => a.id === id ? { ...a, affiliateStatus: 'rejected' } : a));
            else alert('Erro ao recusar.');
        } catch { alert('Erro de conexão.'); }
    };

    const openApprovalModal = (aff: Affiliate) => {
        const existing = aff.affiliateLink;
        setApprovalForm({
            slug: existing?.slug || aff.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || '',
            monthly: existing ? { discountType: existing.discountTypeMonthly as any, discountValue: String(existing.discountValueMonthly) } : emptyProduct(),
            annual: existing ? { discountType: existing.discountTypeAnnual as any, discountValue: String(existing.discountValueAnnual) } : emptyProduct(),
            simulado: existing ? { discountType: existing.discountTypeSimulado as any, discountValue: String(existing.discountValueSimulado) } : emptyProduct(),
        });
        setApprovalError('');
        setApprovalTarget(aff);
    };

    const updateProduct = (product: 'monthly' | 'annual' | 'simulado', field: keyof ProductDiscountForm, value: string) => {
        setApprovalForm(prev => ({ ...prev, [product]: { ...prev[product], [field]: value } }));
    };

    const isFormValid = () => approvalForm.slug.trim() !== '';

    const handleApproveSubmit = async () => {
        if (!approvalTarget || !isFormValid()) return;
        setApprovalLoading(true);
        setApprovalError('');
        try {
            const resp = await fetch(`${API_URL}/admin/affiliates/${approvalTarget.id}/approve`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug: approvalForm.slug,
                    discountTypeMonthly: approvalForm.monthly.discountType,
                    discountValueMonthly: approvalForm.monthly.discountValue,
                    discountTypeAnnual: approvalForm.annual.discountType,
                    discountValueAnnual: approvalForm.annual.discountValue,
                    discountTypeSimulado: approvalForm.simulado.discountType,
                    discountValueSimulado: approvalForm.simulado.discountValue,
                }),
            });
            const data = await resp.json();
            if (resp.ok) {
                setAffiliates(prev => prev.map(a => a.id === approvalTarget.id
                    ? { ...a, affiliateStatus: 'approved', affiliateLink: { slug: approvalForm.slug, checkoutMonthly: '', discountTypeMonthly: approvalForm.monthly.discountType, discountValueMonthly: parseFloat(approvalForm.monthly.discountValue), checkoutAnnual: '', discountTypeAnnual: approvalForm.annual.discountType, discountValueAnnual: parseFloat(approvalForm.annual.discountValue), checkoutSimulado: '', discountTypeSimulado: approvalForm.simulado.discountType, discountValueSimulado: parseFloat(approvalForm.simulado.discountValue) } }
                    : a
                ));
                setApprovalTarget(null);
            } else {
                setApprovalError(data.error || 'Erro ao salvar.');
            }
        } catch {
            setApprovalError('Erro de conexão.');
        } finally {
            setApprovalLoading(false);
        }
    };

    const filteredAffiliates = affiliates.filter(a => {
        const matchesSearch = (a.name?.toLowerCase().includes(searchTerm.toLowerCase()) || a.email?.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesStatus = statusFilter === 'all' || a.affiliateStatus === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const pendingCount = affiliates.filter(a => a.affiliateStatus === 'pending').length;

    if (loading) return <FullPageLoader text="Carregando painel de controle..." />;

    return (
        <div className="animate-fade-in space-y-8">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900 flex items-center gap-4 p-5">
                    <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 rounded-full flex items-center justify-center"><Clock size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pendentes</p>
                        <p className="text-2xl font-black dark:text-white">{pendingCount}</p>
                    </div>
                </Card>
                <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900 flex items-center gap-4 p-5">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center"><Check size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aprovados</p>
                        <p className="text-2xl font-black dark:text-white">{affiliates.filter(a => a.affiliateStatus === 'approved').length}</p>
                    </div>
                </Card>
                <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900 flex items-center gap-4 p-5">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center"><User size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Geral</p>
                        <p className="text-2xl font-black dark:text-white">{affiliates.length}</p>
                    </div>
                </Card>
            </div>

            {/* Search & Filter */}
            <Card className="mb-8 p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-dashed">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input type="text" placeholder="Buscar parceiro por nome ou e-mail..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all dark:text-white" />
                    </div>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                        {(['all', 'pending', 'approved', 'rejected'] as const).map(status => (
                            <button key={status} onClick={() => setStatusFilter(status)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-tighter transition-all ${statusFilter === status ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {status === 'all' ? 'Ver Todos' : status === 'pending' ? 'Pendentes' : status === 'approved' ? 'Ativos' : 'Recusados'}
                            </button>
                        ))}
                    </div>
                </div>
            </Card>

            {/* List */}
            {error ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 p-8 rounded-2xl text-center">
                    <ShieldCheck className="mx-auto mb-4" size={48} />
                    <h3 className="text-xl font-bold mb-2">{error}</h3>
                    <Button onClick={fetchAffiliates} variant="outline" className="mt-4">Tentar Novamente</Button>
                </div>
            ) : filteredAffiliates.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-100 dark:border-slate-800 p-20 rounded-3xl text-center flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-700 rounded-full flex items-center justify-center mb-6"><Filter size={40} /></div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-slate-200">Nenhum resultado</h3>
                    <p className="text-slate-500 max-w-sm mt-2">Não encontramos nenhum afiliado {statusFilter !== 'all' ? `com status "${statusFilter}"` : ''} que corresponda à sua busca.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredAffiliates.map(aff => (
                        <Card key={aff.id} className="p-4 bg-white dark:bg-slate-900 hover:border-purple-200 dark:hover:border-purple-900/50 transition-all group overflow-hidden relative">
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center gap-4 w-full md:w-auto">
                                    <div className="relative">
                                        <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center text-xl font-black shadow-inner">
                                            {aff.name?.charAt(0) || 'A'}
                                        </div>
                                        {aff.affiliateStatus === 'pending' && <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full border-2 border-white dark:border-slate-900 animate-pulse"></span>}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-black text-slate-800 dark:text-slate-100">{aff.name}</h3>
                                            {aff.affiliateStatus === 'approved' && <Badge color="green">Ativo</Badge>}
                                            {aff.affiliateLink?.slug && (
                                                <span className="text-xs text-purple-500 font-mono bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full">
                                                    ?affid={aff.affiliateLink.slug}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-1">
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Mail size={12} className="text-purple-400" /> {aff.email}</div>
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Calendar size={12} className="text-slate-400" /> {new Date(aff.createdAt).toLocaleDateString('pt-BR')}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center w-full md:w-auto justify-between md:justify-end gap-6 border-t md:border-t-0 pt-4 md:pt-0 border-slate-50 dark:border-slate-800">
                                    <div className="text-center md:text-right">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                                        <div className="flex items-center gap-2">
                                            {aff.affiliateStatus === 'pending' ? <span className="text-yellow-600 dark:text-yellow-400 font-bold text-xs">Pendente</span>
                                                : aff.affiliateStatus === 'approved' ? <span className="text-green-600 dark:text-green-400 font-bold text-xs">Parceiro Oficial</span>
                                                : <span className="text-red-600 dark:text-red-400 font-bold text-xs">Recusado</span>}
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        {aff.affiliateStatus === 'pending' ? (
                                            <>
                                                <button onClick={() => openApprovalModal(aff)}
                                                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-green-500/30 transition-all flex items-center gap-2">
                                                    <Check size={16} /> Aprovar
                                                </button>
                                                <button onClick={() => handleReject(aff.id)}
                                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                                                    <X size={16} /> Recusar
                                                </button>
                                            </>
                                        ) : aff.affiliateStatus === 'approved' ? (
                                            <button onClick={() => openApprovalModal(aff)}
                                                className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-purple-600 transition-colors p-2">
                                                <Link size={14} /> Editar Links
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Approval Modal */}
            {approvalTarget && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-xl font-black text-slate-800 dark:text-white">
                                {approvalTarget.affiliateStatus === 'approved' ? 'Editar Descontos — ' : 'Aprovar Afiliado — '}
                                <span className="text-purple-600">{approvalTarget.name}</span>
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                Ao confirmar, o sistema envia automaticamente um e-mail para o afiliado com os 3 links de convite da Kiwify.
                            </p>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Slug */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-2">
                                    Slug da página (studr.com.br?affid=...)
                                </label>
                                <input
                                    type="text"
                                    value={approvalForm.slug}
                                    onChange={e => setApprovalForm(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                    placeholder="ex: joao-silva"
                                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>

                            {/* Products */}
                            {(['monthly', 'annual', 'simulado'] as const).map(product => {
                                const labels = { monthly: 'Plano Mensal', annual: 'Plano Anual', simulado: 'Plano Simulado' };
                                const base = BASE_PRICES[product];
                                const form = approvalForm[product];
                                const preview = calcDisplayPrice(base, form.discountType, parseFloat(form.discountValue) || 0);
                                return (
                                    <div key={product} className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">{labels[product]}</h4>
                                            <span className="text-xs text-slate-400">Base: R$ {base.toFixed(2).replace('.', ',')} /mês</span>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="flex-1">
                                                <label className="block text-xs text-slate-500 mb-1">Tipo de desconto</label>
                                                <select
                                                    value={form.discountType}
                                                    onChange={e => updateProduct(product, 'discountType', e.target.value)}
                                                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                                >
                                                    <option value="percent">Percentual (%)</option>
                                                    <option value="fixed">Valor fixo (R$)</option>
                                                </select>
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs text-slate-500 mb-1">
                                                    Valor ({form.discountType === 'percent' ? '%' : 'R$'})
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={form.discountValue}
                                                    onChange={e => updateProduct(product, 'discountValue', e.target.value)}
                                                    className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                                />
                                            </div>
                                            <div className="flex-1 flex flex-col justify-end">
                                                <label className="block text-xs text-slate-500 mb-1">Preço exibido</label>
                                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-lg px-3 py-2 text-xs font-bold text-green-700 dark:text-green-400">
                                                    R$ {preview.toFixed(2).replace('.', ',')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {approvalError && (
                                <p className="text-sm text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{approvalError}</p>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setApprovalTarget(null)}>Cancelar</Button>
                            <Button
                                onClick={handleApproveSubmit}
                                loading={approvalLoading}
                                disabled={!isFormValid()}
                                className="bg-green-500 hover:bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {approvalTarget.affiliateStatus === 'approved' ? 'Salvar Alterações' : '✓ Confirmar Aprovação'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminAffiliatesView;
