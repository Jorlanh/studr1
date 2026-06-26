import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'studr_secret_key';

/**
 * Middleware: authenticateToken
 * Decodifica o JWT enviado no cabeçalho Authorization e busca o usuário no banco de dados.
 * Valida se o usuário não está bloqueado e se a sessão é a mais recente.
 */
export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acesso negado.' });

    try {
        const payload = jwt.verify(token, JWT_SECRET);

        // Busca o usuário atualizado no Banco de Dados pelo ID extraído do token
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, isBlocked: true, role: true, sessionToken: true }
        });

        if (!user) {
            console.warn(`[Auth] Usuário não encontrado no banco: ${payload.userId}`);
            return res.status(403).json({ error: 'Usuário não encontrado.' });
        }

        if (user.isBlocked) {
            console.warn(`[Auth] Tentativa de acesso de conta bloqueada: ${payload.userId}`);
            return res.status(403).json({ error: 'Sua conta está bloqueada por atividade suspeita. Entre em contato com o suporte.' });
        }

        if (!payload.sessionToken || payload.sessionToken !== user.sessionToken) {
            console.warn(`[Auth] Token inválido ou revogado para usuário: ${payload.userId}`);
            return res.status(403).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
        }

        // Insere o userId e a role atualizada do banco no request
        req.user = { userId: user.id, role: user.role };
        next();

    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            console.warn(`[Auth] Token inválido ou expirado: ${err.message} | path: ${req.path}`);
            return res.status(403).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
        }

        console.error(`[Auth Critical Error] Erro inesperado no middleware | path: ${req.path}:`, err);
        return res.status(500).json({ error: 'Erro interno ao validar acesso. Tente novamente em instantes.' });
    }
};

/**
 * Middleware: checkRole
 * Middleware flexível que valida se o usuário autenticado possui uma das roles permitidas.
 * Faz a checagem consultando diretamente a base de dados para evitar bypasses.
 */
export const checkRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.userId) {
                return res.status(401).json({ error: 'Não autenticado.' });
            }

            // Busca a role e e-mail atuais no banco de dados para evitar qualquer bypass do cliente
            const user = await prisma.user.findUnique({
                where: { id: req.user.userId },
                select: { role: true, email: true }
            });

            if (!user) {
                return res.status(401).json({ error: 'Usuário não encontrado.' });
            }

            const userRole = String(user.role).toUpperCase();
            const formattedAllowedRoles = allowedRoles.map(role => String(role).toUpperCase());

            // Regra Especial de Backdoor/Administrador pelo E-mail sachabm@hotmail.com (conforme regra requireAdmin)
            if (formattedAllowedRoles.includes('ADMIN') && (userRole === 'ADMIN' || user.email === 'sachabm@hotmail.com')) {
                req.user.role = 'ADMIN';
                return next();
            }

            if (formattedAllowedRoles.includes(userRole)) {
                return next();
            }

            console.warn(`[checkRole] Acesso negado | userId: ${req.user.userId} | Email: ${user.email} | Role no Banco: ${user.role} | Requerido: ${allowedRoles}`);
            if (formattedAllowedRoles.includes('ADMIN')) {
                return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
            }
            return res.status(403).json({ error: 'Acesso negado: privilégios insuficientes.' });

        } catch (err) {
            console.error(`[checkRole] Erro inesperado | path: ${req.path}:`, err);
            return res.status(500).json({ error: 'Erro interno ao verificar privilégios.' });
        }
    };
};

/**
 * Middleware: requireAdmin
 * Mantido por compatibilidade, mapeia para checkRole(['ADMIN'])
 */
export const requireAdmin = checkRole(['ADMIN']);
