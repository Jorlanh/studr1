import React, { useEffect, useState } from 'react';
import { Button, Card, FullPageLoader } from './UIComponents';
import { Save, ExternalLink } from 'lucide-react';

interface ProductForm {
    label: string;
    checkoutUrl: string;
    kiwifyInviteLink: string;
}

const PRODUCT_TYPES = [
    { type: 'monthly', defaultLabel: 'Plano Mensal', description: 'R$ 68/mês — acesso completo' },
    { type: 'annual', defaultLabel: 'Plano Anual', description: 'R$ 39/mês — cobrado anualmente' },
    { type: 'simulado', defaultLabel: 'Plano Simulado', description: 'R$ 11,80/mês — 1 simulado por mês' },
];

const AdminAffiliateProductsView: React.FC = () => {
    const [forms, setForms] = useState<Record<string, ProductForm>>({
        monthly: { label: 'Plano Mensal', checkoutUrl: '', kiwifyInviteLink: '' },
        annual: { label: 'Plano Anual', checkoutUrl: '', kiwifyInviteLink: '' },
        simulado: { label: 'Plano Simulado', checkoutUrl: '', kiwifyInviteLink: '' },
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);
    const [error, setError] = useState('');

    const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, "");

    useEffect(() => {
        fetch(`${API_URL}/admin/affiliate-products`)
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const updated = { ...forms };
                    data.forEach((p: any) => {
                        if (updated[p.productType]) {
                            updated[p.productType] = { label: p.label, checkoutUrl: p.checkoutUrl, kiwifyInviteLink: p.kiwifyInviteLink };
                        }
                    });
                    setForms(updated);
                }
            })
            .catch(() => setError('Erro ao carregar produtos.'))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async (productType: string) => {
        const form = forms[productType];
        if (!form.checkoutUrl || !form.kiwifyInviteLink) return;

        setSaving(productType);
        setError('');
        try {
            const resp = await fetch(`${API_URL}/admin/affiliate-products/${productType}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (resp.ok) {
                setSaved(productType);
                setTimeout(() => setSaved(null), 2000);
            } else {
                const data = await resp.json();
                setError(data.error || 'Erro ao salvar.');
            }
        } catch {
            setError('Erro de conexão.');
        } finally {
            setSaving(null);
        }
    };

    const updateForm = (productType: string, field: keyof ProductForm, value: string) => {
        setForms(prev => ({ ...prev, [productType]: { ...prev[productType], [field]: value } }));
    };

    if (loading) return <FullPageLoader text="Carregando produtos..." />;

    return (
        <div className="animate-fade-in space-y-6">
            <div>
                <h2 className="text-xl font-black text-slate-800 dark:text-white">Produtos Kiwify</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Cadastre uma vez os links de checkout e de convite de afiliado para cada produto. Esses links serão usados automaticamente ao aprovar afiliados.
                </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
                <strong>Onde encontrar o link de convite?</strong> Na Kiwify, vá em <em>Editar produto → aba Afiliados → final da página</em>. Ative a aprovação automática para que os afiliados sejam aprovados sem intervenção manual.
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</p>}

            <div className="grid gap-6">
                {PRODUCT_TYPES.map(({ type, defaultLabel, description }) => {
                    const form = forms[type];
                    const isValid = form.checkoutUrl.trim() !== '' && form.kiwifyInviteLink.trim() !== '';
                    const isSaving = saving === type;
                    const isSaved = saved === type;

                    return (
                        <Card key={type} className="p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="font-black text-slate-800 dark:text-white">{defaultLabel}</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                                </div>
                                {isValid && (
                                    <span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
                                        ✓ Configurado
                                    </span>
                                )}
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                                        Link de Checkout (Kiwify)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="url"
                                            value={form.checkoutUrl}
                                            onChange={e => updateForm(type, 'checkoutUrl', e.target.value)}
                                            placeholder="https://pay.kiwify.com.br/..."
                                            className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-enem-blue outline-none"
                                        />
                                        {form.checkoutUrl && (
                                            <a href={form.checkoutUrl} target="_blank" rel="noopener noreferrer"
                                                className="p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 hover:text-enem-blue hover:border-enem-blue transition-colors">
                                                <ExternalLink size={16} />
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                                        Link de Convite de Afiliado (Kiwify)
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="url"
                                            value={form.kiwifyInviteLink}
                                            onChange={e => updateForm(type, 'kiwifyInviteLink', e.target.value)}
                                            placeholder="https://kiwify.com.br/affiliate/invite/..."
                                            className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-enem-blue outline-none"
                                        />
                                        {form.kiwifyInviteLink && (
                                            <a href={form.kiwifyInviteLink} target="_blank" rel="noopener noreferrer"
                                                className="p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 hover:text-enem-blue hover:border-enem-blue transition-colors">
                                                <ExternalLink size={16} />
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end pt-1">
                                    <Button
                                        onClick={() => handleSave(type)}
                                        loading={isSaving}
                                        disabled={!isValid || isSaving}
                                        className={`flex items-center gap-2 text-sm ${isSaved ? 'bg-green-500 hover:bg-green-500' : 'bg-enem-blue hover:bg-blue-700'} text-white disabled:opacity-40`}
                                    >
                                        <Save size={14} />
                                        {isSaved ? 'Salvo!' : 'Salvar'}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminAffiliateProductsView;
