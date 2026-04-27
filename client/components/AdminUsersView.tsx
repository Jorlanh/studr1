import React, { useEffect, useState } from 'react';
import { Button, Card, FullPageLoader, Badge } from './UIComponents';
import { Search, Shield, ShieldOff, User, Mail, Calendar, Filter, UserCheck, UserX } from 'lucide-react';

interface UserData {
    id: string;
    email: string;
    name: string;
    role: string;
    isVerified: boolean;
    isBlocked: boolean;
    isPremium: boolean;
    createdAt: string;
    level: number;
}

const AdminUsersView: React.FC = () => {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, "");

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const resp = await fetch(`${API_URL}/admin/users`);
            const data = await resp.json();
            if (resp.ok) {
                setUsers(data);
            } else {
                setError(data.error || 'Erro ao carregar usuários.');
            }
        } catch (err) {
            setError('Erro de conexão.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const toggleBlock = async (id: string) => {
        try {
            const resp = await fetch(`${API_URL}/admin/users/${id}/toggle-block`, {
                method: 'PUT'
            });
            if (resp.ok) {
                setUsers(prev => prev.map(u => u.id === id ? { ...u, isBlocked: !u.isBlocked } : u));
            }
        } catch (err) {
            alert('Erro ao alterar status.');
        }
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             u.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    if (loading) return <FullPageLoader text="Carregando lista de usuários..." />;

    return (
        <div className="animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar usuário..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-2.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                    />
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {['all', 'admin', 'student', 'affiliate'].map(role => (
                        <button
                            key={role}
                            onClick={() => setRoleFilter(role)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                                roleFilter === role ? 'bg-white dark:bg-slate-700 text-purple-600' : 'text-slate-500'
                            }`}
                        >
                            {role === 'all' ? 'Todos' : role}
                        </button>
                    ))}
                </div>
            </div>

            {error ? (
                <Card className="text-center p-12 text-red-500">{error}</Card>
            ) : filteredUsers.length === 0 ? (
                <div className="text-center p-20 text-slate-400">Nenhum usuário encontrado.</div>
            ) : (
                <div className="grid gap-3">
                    {filteredUsers.map(user => (
                        <Card key={user.id} className={`p-4 transition-all ${user.isBlocked ? 'opacity-60 bg-slate-50 grayscale' : 'hover:border-purple-200'}`}>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg
                                        ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : user.isPremium ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-500'}
                                    `}>
                                        {user.name?.charAt(0) || 'U'}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-slate-800 dark:text-slate-100">{user.name}</span>
                                            {user.isPremium && <Badge color="yellow">Premium</Badge>}
                                            {user.isBlocked && <Badge color="red">Bloqueado</Badge>}
                                        </div>
                                        <div className="text-xs text-slate-500 flex items-center gap-3 mt-1 font-medium">
                                            <span className="flex items-center gap-1"><Mail size={12}/> {user.email}</span>
                                            <span className="flex items-center gap-1"><Shield size={12}/> {user.role}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                                    <div className="text-center sm:text-right hidden md:block">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Nível</p>
                                        <p className="font-black text-slate-700 dark:text-slate-300">{user.level || 1}</p>
                                    </div>
                                    <button 
                                        onClick={() => toggleBlock(user.id)}
                                        className={`p-2 rounded-xl transition-all ${
                                            user.isBlocked 
                                            ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                                            : 'bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600'
                                        }`}
                                        title={user.isBlocked ? 'Desbloquear' : 'Bloquear'}
                                    >
                                        {user.isBlocked ? <UserCheck size={20}/> : <UserX size={20}/>}
                                    </button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminUsersView;
