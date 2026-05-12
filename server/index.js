import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';

// ─── SERVICES ─────────────────────────────────────────────────────────────
import * as aiService from './services/aiService.js';
import { checkAndConsumeQuestion, checkAndConsumeMock } from './services/planService.js';
import { calculateScore, calculateFinalGrade } from './services/scoringService.js';

// 🛡️ IMPORTAÇÕES DA TORRE CORRIGIDAS
import { getUserTower, submitFloorResult, getTop3ForBuilding, getTowerMetadata } from './services/towerService.js';

import { emitEvent, getState as getGamificationState } from './services/gamificationService.js';
import { getCurrentRanking, rolloverWeek } from './services/rankingService.js';
import { asaasService } from './services/asaasService.js';

import cron from 'node-cron';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const E2E_MODE = process.env.E2E_MODE === '1';
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'studr_secret_key';

const ABUSE_THRESHOLD = 5;       // max new fingerprints in 7 days before account block
const CODE_EXPIRY_MINUTES = 10;  // device auth code expiry

const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : ['http://localhost:3000'];

app.use(cors({
    origin: [...allowedOrigins, 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));
app.use(express.json());

// ─── Helper: send device verification email ───────────────────────────────────
async function sendDeviceVerificationEmail(email, name, code) {
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Studr <onboarding@resend.dev>',
        to: email,
        subject: '🔒 Novo aparelho detectado - Studr',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: #004aad;">Novo aparelho detectado</h2>
                <p>Olá, <strong>${name || 'aluno'}</strong>!</p>
                <p>Identificamos um login de um aparelho que ainda não está na sua lista de dispositivos confiáveis.</p>
                <p>Para autorizar este acesso, use o código abaixo:</p>
                <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; text-align: center; padding: 20px; background: #f0f4ff; border-radius: 8px; margin: 20px 0;">
                    ${code}
                </div>
                <p style="color: #999; font-size: 12px;">Este código expira em ${CODE_EXPIRY_MINUTES} minutos. Se não foi você, ignore este e-mail e troque sua senha.</p>
            </div>
        `
    });
}

async function sendRecoveryEmail(email, name, code) {
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Studr <onboarding@resend.dev>',
        to: email,
        subject: '🔑 Recuperação de Senha - Studr',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: #004aad;">Recuperação de Senha</h2>
                <p>Olá, <strong>${name || 'aluno'}</strong>!</p>
                <p>Você solicitou a recuperação da sua senha no Studr.</p>
                <p>Use o código abaixo para redefinir sua senha:</p>
                <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; text-align: center; padding: 20px; background: #f0f4ff; border-radius: 8px; margin: 20px 0;">
                    ${code}
                </div>
                <p style="color: #999; font-size: 12px;">Este código expira em ${CODE_EXPIRY_MINUTES} minutos. Se você não solicitou isso, ignore este e-mail.</p>
            </div>
        `
    });
}

// ─── Middleware: authenticateToken (Multi-acesso Liberado) ───────────────────
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acesso negado.' });

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, isBlocked: true, role: true }
        });

        if (!user) {
            console.warn(`[Auth] Usuário não encontrado no banco: ${payload.userId}`);
            return res.status(403).json({ error: 'Usuário não encontrado.' });
        }

        if (user.isBlocked) {
            console.warn(`[Auth] Tentativa de acesso de conta bloqueada: ${payload.userId}`);
            return res.status(403).json({ error: 'Sua conta está bloqueada por atividade suspeita. Entre em contato com o suporte.' });
        }

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

// ─── Middleware: requireAdmin (must run AFTER authenticateToken) ──────────────
const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Não autenticado.' });
        }

        if (req.user.role !== 'admin') {
            console.warn(`[Admin] Tentativa de acesso admin negada | userId: ${req.user.userId} | path: ${req.path}`);
            return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
        }

        next();
    } catch (err) {
        console.error(`[requireAdmin] Erro inesperado | path: ${req.path}:`, err);
        return res.status(500).json({ error: 'Erro interno.' });
    }
};

// ─── Routes ───────────────────────────────────────────────────────────────────

// Payments
app.post('/api/payments/create-checkout', authenticateToken, async (req, res) => {
    try {
        const { planType } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

        const asaasCustomerId = await asaasService.getOrCreateCustomer(user);
        
        if (user.asaasCustomerId !== asaasCustomerId) {
            await prisma.user.update({
                where: { id: user.id },
                data: { asaasCustomerId }
            });
        }

        const { subscriptionId, invoiceUrl } = await asaasService.createSubscription(asaasCustomerId, planType);

        await prisma.user.update({
            where: { id: user.id },
            data: { 
                asaasSubscriptionId: subscriptionId,
                subscriptionStatus: 'PENDING',
                billingCycle: planType === 'annual' ? 'YEARLY' : 'MONTHLY'
            }
        });

        res.json({ checkoutUrl: invoiceUrl });
    } catch (error) {
        console.error('Erro no Checkout:', error);
        res.status(500).json({ error: error.message || 'Erro ao processar pagamento.' });
    }
});

// Kiwify Webhook
app.post('/api/webhooks/kiwify', async (req, res) => {
    try {
        const { token } = req.query;
        const expectedToken = process.env.KIWIFY_TOKEN;

        if (expectedToken && token !== expectedToken) {
            console.error('[Kiwify Webhook] Invalid Token provided in query string');
            return res.status(401).json({ error: 'Unauthorized: Invalid Token' });
        }

        const body = req.body;
        console.log('[Kiwify Webhook] Event Received:', body.order_status, body.customer?.email);

        const { order_status, customer, product_id, subscription_id } = body;

        if (!customer?.email) {
            return res.status(400).json({ error: 'Missing customer email' });
        }

        const email = customer.email.toLowerCase();
        const name = customer.full_name || customer.first_name || '';

        const plan = await prisma.plan.findUnique({
            where: { kiwifyProductId: product_id }
        });

        if (order_status === 'paid') {
            let user = await prisma.user.findUnique({ where: { email } });
            let isNewUser = false;
            let tempPassword = '';

            if (!user) {
                isNewUser = true;
                tempPassword = Math.random().toString(36).slice(-8); 
                const hashedPassword = await bcrypt.hash(tempPassword, 10);
                
                user = await prisma.user.create({
                    data: {
                        email,
                        name,
                        password: hashedPassword,
                        isVerified: true,
                    }
                });
            }

            const isFullAccess = plan ? plan.accessLevel === 'FULL' : true; 
            const subStatus = plan ? plan.accessLevel : 'ACTIVE';
            const cycle = plan ? plan.billingCycle : (body.product_name?.toLowerCase().includes('anual') ? 'YEARLY' : 'MONTHLY');

            await prisma.user.update({
                where: { email },
                data: {
                    isPremium: isFullAccess,
                    subscriptionStatus: subStatus,
                    billingCycle: cycle,
                    planId: plan?.id || null,
                    lastPaymentDate: new Date(),
                    trialEndsAt: new Date()
                }
            });

            if (isNewUser) {
                const planName = plan ? plan.name : body.product_name || 'Assinatura';
                await resend.emails.send({
                    from: process.env.RESEND_FROM_EMAIL || 'Studr <onboarding@resend.dev>',
                    to: email,
                    subject: `🚀 Bem-vindo ao Studr! Sua conta no plano ${planName}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; border: 1px solid #eee; border-radius: 12px;">
                            <h2 style="color: #004aad;">Seja bem-vindo(a)!</h2>
                            <p>Sua assinatura do <strong>${planName}</strong> foi confirmada.</p>
                            <p>Use os dados abaixo para acessar a plataforma:</p>
                            <div style="background: #f0f4ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                <p style="margin: 5px 0;"><strong>E-mail:</strong> ${email}</p>
                                <p style="margin: 5px 0;"><strong>Senha Temporária:</strong> ${tempPassword}</p>
                            </div>
                            <p>Acesse agora em: <a href="https://app.studr.com.br" style="color: #004aad; font-weight: bold;">app.studr.com.br</a></p>
                            <p style="color: #999; font-size: 12px; margin-top: 20px;">Recomendamos alterar sua senha após o primeiro acesso.</p>
                        </div>
                    `
                });
            }
        } 
        
        else if (['refunded', 'chargeback', 'canceled'].includes(order_status)) {
            await prisma.user.update({
                where: { email },
                data: {
                    isPremium: false,
                    subscriptionStatus: 'CANCELED',
                    planId: null
                }
            });
            console.log(`[Kiwify Webhook] Access removed for ${email} due to status: ${order_status}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('[Kiwify Webhook Error]:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});


app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, name, password, referralId, referralSource } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email já cadastrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 7);

        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                name,
                password: hashedPassword,
                verificationCode,
                referralId,
                referralSource,
                trialEndsAt
            }
        });

        await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Studr <onboarding@resend.dev>',
            to: email,
            subject: 'Seu código de verificação Studr',
            html: `<p>Olá ${name || ''}, seu código para começar o trial de 7 dias é: <strong>${verificationCode}</strong></p>`
        });

        res.status(201).json({ message: 'Usuário criado. Verifique seu e-mail.', userId: user.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao registrar usuário.' });
    }
});

app.post('/api/auth/register-affiliate', async (req, res) => {
    try {
        const { email, name, password, phone } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email já cadastrado em nossa base.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
                role: 'affiliate',
                affiliateStatus: 'pending',
                isVerified: true
            }
        });

        res.status(201).json({ message: 'Candidatura enviada com sucesso.', userId: user.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao processar candidatura.' });
    }
});

app.post('/api/auth/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || user.verificationCode !== code) {
            return res.status(400).json({ error: 'Código inválido.' });
        }

        const sessionToken = randomUUID();

        await prisma.user.update({
            where: { email },
            data: { isVerified: true, verificationCode: null, sessionToken }
        });

        const token = jwt.sign({ userId: user.id, sessionToken }, JWT_SECRET);
        const updatedUser = await prisma.user.findUnique({ where: { email } });
        res.json({ token, user: buildUserPayload(updatedUser) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro na verificação.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, fingerprint } = req.body;
        console.log(`[Login Attempt] Tentativa de login para: ${email}`);

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            console.warn(`[Login Failed] Usuário não encontrado: ${email}`);
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            console.warn(`[Login Failed] Senha incorreta para o usuário: ${email}`);
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        if (!user.isVerified) {
            console.warn(`[Login Failed] E-mail não verificado: ${email}`);
            return res.status(403).json({ error: 'E-mail não verificado.' });
        }
        if (user.isBlocked) {
            console.warn(`[Login Failed] Conta bloqueada: ${email}`);
            return res.status(403).json({ error: 'Conta bloqueada por atividade suspeita. Entre em contato com o suporte.' });
        }

        const TEST_EMAILS = ['trial@studr.com.br', 'premium@studr.com.br', 'simulado@studr.com.br'];
        if (!fingerprint || TEST_EMAILS.includes(user.email)) {
            const sessionToken = randomUUID();
            await prisma.user.update({ where: { id: user.id }, data: { sessionToken } });
            const token = jwt.sign({ userId: user.id, sessionToken }, JWT_SECRET);
            return res.json({ token, user: buildUserPayload(user) });
        }

        const existingDevice = await prisma.userDevice.findUnique({
            where: { userId_fingerprint: { userId: user.id, fingerprint } }
        });

        if (existingDevice && existingDevice.isAuthorized) {
            const sessionToken = randomUUID();
            await prisma.user.update({ where: { id: user.id }, data: { sessionToken } });
            await prisma.userDevice.update({
                where: { id: existingDevice.id },
                data: { lastSeen: new Date() }
            });
            const token = jwt.sign({ userId: user.id, sessionToken }, JWT_SECRET);
            return res.json({ token, user: buildUserPayload(user) });
        }

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const newDevicesLastWeek = await prisma.userDevice.count({
            where: { userId: user.id, createdAt: { gte: sevenDaysAgo } }
        });

        if (newDevicesLastWeek >= ABUSE_THRESHOLD) {
            await prisma.user.update({ where: { id: user.id }, data: { isBlocked: true } });
            await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'Studr <onboarding@resend.dev>',
                to: user.email,
                subject: '⚠️ Conta bloqueada - Studr',
                html: `<p>Olá ${user.name || ''},</p><p>Detectamos atividade suspeita de compartilhamento de credenciais na sua conta.</p><p>Sua conta foi bloqueada temporariamente. Entre em contato com o suporte.</p>`
            });
            return res.status(403).json({
                error: 'Detectamos atividade suspeita de compartilhamento. Conta bloqueada. Entre em contato com o suporte.'
            });
        }

        const authCode = Math.floor(100000 + Math.random() * 900000).toString();
        const authCodeExpiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

        await prisma.userDevice.upsert({
            where: { userId_fingerprint: { userId: user.id, fingerprint } },
            update: { authCode, authCodeExpiresAt, isAuthorized: false },
            create: { userId: user.id, fingerprint, authCode, authCodeExpiresAt, isAuthorized: false }
        });

        await sendDeviceVerificationEmail(user.email, user.name, authCode);

        return res.status(200).json({
            requiresDeviceVerification: true,
            message: 'Novo aparelho detectado. Enviamos um código de verificação para seu e-mail.'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro no login.' });
    }
});

app.post('/api/auth/verify-device', async (req, res) => {
    try {
        const { email, code, fingerprint } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

        const device = await prisma.userDevice.findUnique({
            where: { userId_fingerprint: { userId: user.id, fingerprint } }
        });

        if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado.' });
        if (device.authCode !== code) return res.status(400).json({ error: 'Código inválido.' });
        if (device.authCodeExpiresAt < new Date()) {
            return res.status(400).json({ error: 'Código expirado. Faça login novamente para receber um novo código.' });
        }

        await prisma.userDevice.update({
            where: { id: device.id },
            data: { isAuthorized: true, authCode: null, authCodeExpiresAt: null, lastSeen: new Date() }
        });

        const sessionToken = randomUUID();
        await prisma.user.update({ where: { id: user.id }, data: { sessionToken } });

        const token = jwt.sign({ userId: user.id, sessionToken }, JWT_SECRET);
        res.json({ token, user: buildUserPayload(user) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao verificar dispositivo.' });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.json({ message: 'Se este e-mail estiver cadastrado, você receberá um código de recuperação.' });
        }

        const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();
        const recoveryCodeExpiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: { recoveryCode, recoveryCodeExpiresAt }
        });

        await sendRecoveryEmail(user.email, user.name, recoveryCode);

        res.json({ message: 'Se este e-mail estiver cadastrado, você receberá um código de recuperação.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao solicitar recuperação.' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || user.recoveryCode !== code) {
            return res.status(400).json({ error: 'Código inválido.' });
        }

        if (user.recoveryCodeExpiresAt < new Date()) {
            return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                recoveryCode: null,
                recoveryCodeExpiresAt: null,
                sessionToken: randomUUID() 
            }
        });

        res.json({ message: 'Senha redefinida com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao redefinir senha.' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.json({ user: buildUserPayload(user) });
    } catch (error) {
        console.error('[Auth/me] Erro:', error);
        res.status(500).json({ error: 'Erro ao validar sessão.' });
    }
});

function buildUserPayload(user) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        affiliateStatus: user.affiliateStatus,
        xp: user.xp,
        level: user.level,
        isPremium: user.isPremium,
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
        trialActive: user.isPremium ? false : new Date() < new Date(user.trialEndsAt)
    };
}


// Admin Routes
app.get('/api/admin/affiliates', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const affiliates = await prisma.user.findMany({
            where: { role: 'affiliate' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(affiliates);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar afiliados.' });
    }
});

app.put('/api/admin/affiliates/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await prisma.user.update({
            where: { id },
            data: { affiliateStatus: status }
        });

        res.json({ message: 'Status atualizado com sucesso.' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar status.' });
    }
});

app.get('/api/admin/affiliate-products', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const products = await prisma.affiliateProduct.findMany({ orderBy: { productType: 'asc' } });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar produtos.' });
    }
});

app.put('/api/admin/affiliate-products/:productType', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { productType } = req.params;
        const { label, checkoutUrl, kiwifyInviteLink } = req.body;

        if (!checkoutUrl || !kiwifyInviteLink) {
            return res.status(400).json({ error: 'Checkout URL e link de convite são obrigatórios.' });
        }

        const product = await prisma.affiliateProduct.upsert({
            where: { productType },
            update: { label, checkoutUrl, kiwifyInviteLink },
            create: { productType, label, checkoutUrl, kiwifyInviteLink },
        });

        res.json(product);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao salvar produto.' });
    }
});

app.put('/api/admin/affiliates/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            slug,
            discountTypeMonthly, discountValueMonthly,
            discountTypeAnnual, discountValueAnnual,
            discountTypeSimulado, discountValueSimulado,
        } = req.body;

        if (!slug) {
            return res.status(400).json({ error: 'Slug é obrigatório.' });
        }

        const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');

        const products = await prisma.affiliateProduct.findMany();
        if (products.length < 3) {
            return res.status(400).json({ error: 'Cadastre os 3 produtos na aba Produtos antes de aprovar afiliados.' });
        }

        const affiliate = await prisma.user.findUnique({ where: { id } });
        if (!affiliate) return res.status(404).json({ error: 'Afiliado não encontrado.' });

        await prisma.affiliateLink.upsert({
            where: { userId: id },
            update: {
                slug: cleanSlug,
                discountTypeMonthly, discountValueMonthly: parseFloat(discountValueMonthly) || 0,
                discountTypeAnnual, discountValueAnnual: parseFloat(discountValueAnnual) || 0,
                discountTypeSimulado, discountValueSimulado: parseFloat(discountValueSimulado) || 0,
            },
            create: {
                userId: id,
                slug: cleanSlug,
                discountTypeMonthly, discountValueMonthly: parseFloat(discountValueMonthly) || 0,
                discountTypeAnnual, discountValueAnnual: parseFloat(discountValueAnnual) || 0,
                discountTypeSimulado, discountValueSimulado: parseFloat(discountValueSimulado) || 0,
            }
        });

        await prisma.user.update({ where: { id }, data: { affiliateStatus: 'approved' } });

        const productMap = Object.fromEntries(products.map(p => [p.productType, p]));
        const monthlyInvite = productMap['monthly']?.kiwifyInviteLink || '';
        const annualInvite = productMap['annual']?.kiwifyInviteLink || '';
        const simuladoInvite = productMap['simulado']?.kiwifyInviteLink || '';

        await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Studr <onboarding@resend.dev>',
            to: affiliate.email,
            subject: '🎉 Você foi aprovado como afiliado Studr!',
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
                    <h2 style="color:#004aad">Parabéns, ${affiliate.name || 'parceiro'}! Você é um afiliado oficial Studr 🚀</h2>
                    <p>Sua solicitação foi aprovada. Para ativar sua conta de afiliado na Kiwify, clique nos links abaixo para cada produto:</p>

                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:24px 0">
                        <p style="margin:0 0 12px 0"><strong>📦 Plano Mensal</strong><br/>
                        <a href="${monthlyInvite}" style="color:#004aad">${monthlyInvite}</a></p>

                        <p style="margin:0 0 12px 0"><strong>📦 Plano Anual</strong><br/>
                        <a href="${annualInvite}" style="color:#004aad">${annualInvite}</a></p>

                        <p style="margin:0"><strong>📦 Plano Simulado</strong><br/>
                        <a href="${simuladoInvite}" style="color:#004aad">${simuladoInvite}</a></p>
                    </div>

                    <p>Ao clicar em cada link você será automaticamente aprovado como afiliado daquele produto na Kiwify. Se ainda não tiver conta lá, poderá criar na hora.</p>

                    <p>Seu link de divulgação é:<br/>
                    <strong>https://studr.com.br?affid=${cleanSlug}</strong></p>

                    <p>Qualquer dúvida, responda este e-mail.</p>
                    <p style="color:#94a3b8;font-size:12px">Equipe Studr</p>
                </div>
            `
        });

        res.json({ message: 'Afiliado aprovado e e-mail enviado.' });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Esse slug já está em uso.' });
        }
        res.status(500).json({ error: 'Erro ao aprovar afiliado.' });
    }
});

app.get('/api/affiliate/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const link = await prisma.affiliateLink.findUnique({
            where: { slug },
            include: { user: { select: { name: true, affiliateStatus: true } } }
        });

        if (!link || link.user.affiliateStatus !== 'approved') {
            return res.status(404).json({ error: 'Afiliado não encontrado.' });
        }

        const products = await prisma.affiliateProduct.findMany();
        const productMap = Object.fromEntries(products.map(p => [p.productType, p]));

        res.json({
            slug: link.slug,
            affiliateName: link.user.name,
            monthly: {
                checkoutUrl: productMap['monthly']?.checkoutUrl || '',
                discountType: link.discountTypeMonthly,
                discountValue: link.discountValueMonthly,
            },
            annual: {
                checkoutUrl: productMap['annual']?.checkoutUrl || '',
                discountType: link.discountTypeAnnual,
                discountValue: link.discountValueAnnual,
            },
            simulado: {
                checkoutUrl: productMap['simulado']?.checkoutUrl || '',
                discountType: link.discountTypeSimulado,
                discountValue: link.discountValueSimulado,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar afiliado.' });
    }
});

// Admin Users & Stats
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isVerified: true,
                isBlocked: true,
                isPremium: true,
                subscriptionStatus: true,
                createdAt: true,
                xp: true,
                level: true
            }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar usuários.' });
    }
});

app.put('/api/admin/users/:id/toggle-block', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({ where: { id } });
        
        await prisma.user.update({
            where: { id },
            data: { isBlocked: !user.isBlocked }
        });

        res.json({ message: `Usuário ${!user.isBlocked ? 'bloqueado' : 'desbloqueado'} com sucesso.` });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao alterar status do usuário.' });
    }
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalUsers = await prisma.user.count();
        const premiumUsers = await prisma.user.count({ where: { isPremium: true } });
        const pendingAffiliates = await prisma.user.count({ where: { role: 'affiliate', affiliateStatus: 'pending' } });
        const totalXP = await prisma.user.aggregate({ _sum: { xp: true } });

        res.json({
            totalUsers,
            premiumUsers,
            pendingAffiliates,
            totalXP: totalXP._sum.xp || 0
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao obter estatísticas.' });
    }
});

// ─── Plan enforcement endpoints ───────────────────────────────────────────────

app.post('/api/practice/start', authenticateToken, async (req, res) => {
    try {
        const check = await checkAndConsumeQuestion(req.user.userId, 0); 
        if (!check.allowed) {
            return res.status(403).json({ error: check.reason, details: check });
        }
        res.json({ ok: true, remaining: check.remaining ?? null });
    } catch (error) {
        console.error('[Plan] Erro em /practice/start:', error);
        res.status(500).json({ error: 'Erro ao verificar plano.' });
    }
});

app.post('/api/mock/start', authenticateToken, async (req, res) => {
    try {
        const check = await checkAndConsumeMock(req.user.userId);
        if (!check.allowed) {
            return res.status(403).json({ error: check.reason });
        }
        const { mode, area } = req.body || {};
        const exam = await prisma.exam.create({
            data: {
                userId: req.user.userId,
                type: mode === 'FULL' ? 'MOCK_FULL' : mode === 'AREA' ? 'MOCK_AREA' : 'MOCK_FULL',
                area: mode === 'AREA' ? (area || null) : 'MIXED',
            },
        });
        res.json({ ok: true, examId: exam.id });
    } catch (error) {
        console.error('[Plan] Erro em /mock/start:', error);
        res.status(500).json({ error: 'Erro ao verificar plano.' });
    }
});

app.post('/api/exams/:id/finalize', authenticateToken, async (req, res) => {
    try {
        const examId = req.params.id;
        const userId = req.user.userId;

        const exam = await prisma.exam.findFirst({ where: { id: examId, userId } });
        if (!exam) return res.status(404).json({ error: 'Simulado não encontrado.' });
        if (exam.finalizedAt) return res.status(400).json({ error: 'Simulado já finalizado.' });

        const { responses, redacaoScore } = req.body;
        if (!Array.isArray(responses) || responses.length === 0) {
            return res.status(400).json({ error: 'Respostas inválidas.' });
        }

        const { theta, score, band, finalAverage, scoresByArea } = await calculateFinalGrade(responses, redacaoScore || 0);
        const timeSpentSec = Math.round((Date.now() - new Date(exam.createdAt).getTime()) / 1000);

        await prisma.exam.update({
            where: { id: examId },
            data: { score: finalAverage, theta, band, timeSpentSec, finalizedAt: new Date() },
        });

        const updateOps = responses
            .filter(r => typeof r.orderIndex === 'number')
            .map(r =>
                prisma.examQuestion.updateMany({
                    where: { examId, orderIndex: r.orderIndex },
                    data: {
                        userAnswer: r.userAnswer ?? null,
                        isCorrect: !!r.correct,
                        answeredAt: new Date(),
                    },
                })
            );
        if (updateOps.length > 0) await Promise.all(updateOps);

        res.json({ score: finalAverage, band, theta, scoresByArea });
    } catch (err) {
        console.error('[finalize] erro:', err);
        res.status(500).json({ error: 'Erro ao finalizar simulado.' });
    }
});

app.put('/api/exams/:examId/questions/:orderIndex/answer', authenticateToken, async (req, res) => {
    try {
        const { examId, orderIndex } = req.params;
        const { userAnswer } = req.body;

        const exam = await prisma.exam.findFirst({ where: { id: examId, userId: req.user.userId } });
        if (!exam) return res.status(404).json({ error: 'Simulado não encontrado.' });

        const q = await prisma.examQuestion.findUnique({
            where: { examId_orderIndex: { examId, orderIndex: parseInt(orderIndex) } },
        });
        if (!q) return res.status(404).json({ error: 'Questão não encontrada.' });

        const isCorrect = userAnswer === q.correctAnswer;
        await prisma.examQuestion.update({
            where: { examId_orderIndex: { examId, orderIndex: parseInt(orderIndex) } },
            data: { userAnswer, isCorrect, answeredAt: new Date() },
        });

        res.json({ ok: true, isCorrect });
    } catch (err) {
        console.error('[answer] erro:', err);
        res.status(500).json({ error: 'Erro ao registrar resposta.' });
    }
});

app.get('/api/exams', authenticateToken, async (req, res) => {
    try {
        const exams = await prisma.exam.findMany({
            where: { userId: req.user.userId, finalizedAt: { not: null } },
            orderBy: { finalizedAt: 'desc' },
            select: {
                id: true, type: true, area: true, score: true, band: true,
                timeSpentSec: true, finalizedAt: true, createdAt: true,
                _count: { select: { questions: true } },
            },
        });
        res.json(exams);
    } catch (err) {
        console.error('[exams] erro:', err);
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});

app.get('/api/exams/:id', authenticateToken, async (req, res) => {
    try {
        const exam = await prisma.exam.findFirst({
            where: { id: req.params.id, userId: req.user.userId },
            include: { questions: { orderBy: { orderIndex: 'asc' } } },
        });
        if (!exam) return res.status(404).json({ error: 'Simulado não encontrado.' });
        res.json(exam);
    } catch (err) {
        console.error('[exam detail] erro:', err);
        res.status(500).json({ error: 'Erro ao buscar simulado.' });
    }
});

// ─── Torre Infinita Rotas ─────────────────────────────────────────────────────

app.get('/api/tower/state', authenticateToken, async (req, res) => {
    try {
        const tower = await getUserTower(req.user.userId);
        res.json(tower);
    } catch (err) {
        console.error('[tower/state] erro:', err);
        res.status(500).json({ error: 'Erro ao carregar mapa da Torre.' });
    }
});

// 🚨 ROTA DA TORRE CORRIGIDA: SUPORTA HITS (QUIZ) E SCORE (REDAÇÃO BOSS)
app.post('/api/tower/submit', authenticateToken, async (req, res) => {
    try {
        const { floorId, hits, score } = req.body;
        
        if (!floorId) {
            return res.status(400).json({ error: 'floorId é obrigatório.' });
        }

        // O Quiz passa "hits" (acertos), a Redação passa "score" direto.
        const isEssay = typeof score === 'number';
        const finalHits = isEssay ? null : (hits || 0);

        const result = await submitFloorResult(req.user.userId, floorId, finalHits, score);
        res.json(result); 
    } catch (err) {
        console.error('[tower/submit] erro:', err.message);
        res.status(500).json({ error: 'Erro ao validar andar da torre.' });
    }
});

app.get('/api/tower/top3/:floorNumber', authenticateToken, async (req, res) => {
    try {
        const top3 = await getTop3ForBuilding(req.params.floorNumber);
        res.json(top3);
    } catch (err) {
        console.error('[tower/top3] erro:', err);
        res.status(500).json({ error: 'Erro ao buscar Top 3.' });
    }
});

// ─── Gamification Routes ──────────────────────────────────────────────────────

app.post('/api/gamification/event', authenticateToken, async (req, res) => {
    try {
        const { eventType, payload = {} } = req.body;
        if (!eventType) return res.status(400).json({ error: 'eventType obrigatório.' });

        const result = await emitEvent(req.user.userId, eventType, payload);
        res.json(result); 
    } catch (err) {
        console.error('[gamification/event] erro:', err);
        res.status(500).json({ error: 'Erro ao processar evento.' });
    }
});

app.get('/api/gamification/state', authenticateToken, async (req, res) => {
    try {
        const state = await getGamificationState(req.user.userId);
        res.json(state);
    } catch (err) {
        console.error('[gamification/state] erro:', err);
        res.status(500).json({ error: 'Erro ao buscar estado.' });
    }
});

// ─── Ranking ──────────────────────────────────────────────────────────────────

app.get('/api/ranking', authenticateToken, async (req, res) => {
    try {
        const limit  = parseInt(req.query.limit  || '50');
        const offset = parseInt(req.query.offset || '0');
        const ranking = await getCurrentRanking(req.user.userId, limit, offset);
        res.json(ranking);
    } catch (err) {
        console.error('[ranking] erro:', err);
        res.status(500).json({ error: 'Erro ao buscar ranking.' });
    }
});

// ─── Cron ─────
if (process.env.TEST !== '1') {
    cron.schedule('5 0 * * 1', async () => {
        console.log('[cron] Executando rolloverWeek...');
        try {
            await rolloverWeek();
            console.log('[cron] rolloverWeek concluído.');
        } catch (err) {
            console.error('[cron] Erro no rolloverWeek:', err);
        }
    }, { timezone: 'America/Sao_Paulo' });
}

const DIFFICULTY_KEY = { 'Fácil': 'EASY', 'Média': 'MEDIUM', 'Difícil': 'HARD' };

// AI Routes
app.post('/api/ai/generate-questions', authenticateToken, async (req, res) => {
    try {
        const { area, count, specificTopic, excludeTopics, isReviewErrors, inMock, examId } = req.body;

        if (E2E_MODE) {
            const stub = Array.from({ length: count || 1 }, (_, i) => ({
                id: `e2e-${area}-${i}`,
                stem: `[E2E] Questão ${i + 1} de ${area}`,
                options: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E'],
                correctIndex: 0,
                subject: specificTopic || area,
                difficulty: 'MEDIUM',
                area: area || 'EXATAS',
                explanation: '[E2E] Explicação de teste — alternativa A está correta.',
            }));
            return res.json(stub);
        }

        if (!inMock) {
            const check = await checkAndConsumeQuestion(req.user.userId, count || 1);
            if (!check.allowed) {
                console.warn(`[Plan] Bloqueado | userId: ${req.user.userId} | reason: ${check.reason}`);
                return res.status(403).json({ error: check.reason, details: check });
            }
        }

        const start = Date.now();
        console.log(`[AI] Gerando ${count} questão(ões) | área: ${area} | tópico: ${specificTopic || 'geral'} | review: ${!!isReviewErrors} | inMock: ${!!inMock}`);
        const questions = await aiService.generateQuestionBatch(area, count, specificTopic, excludeTopics, isReviewErrors);
        console.log(`[AI] ✓ ${questions.length} questão(ões) gerada(s) em ${Date.now() - start}ms`);

        if (examId && questions.length > 0) {
            try {
                const startIndex = await prisma.examQuestion.count({ where: { examId } });
                const rows = questions.map((q, i) => ({
                    examId,
                    orderIndex: startIndex + i,
                    questionJson: q,
                    subject: q.subject || '',
                    difficulty: DIFFICULTY_KEY[q.difficulty] || 'MEDIUM',
                    correctAnswer: q.correctIndex ?? 0,
                    isCorrect: false,
                }));
                await prisma.examQuestion.createMany({ data: rows });
            } catch (dbErr) {
                console.warn('[AI] Falha ao persistir ExamQuestion:', dbErr?.message);
            }
        }

        res.json(questions);
    } catch (error) {
        console.error(`[AI] ✗ Erro após ${Date.now()}ms:`, error);
        res.status(500).json({ error: 'Erro ao gerar questões.' });
    }
});

app.post('/api/ai/analyze-sisu', authenticateToken, async (req, res) => {
    try {
        const { score, desiredCourse, preferredUniversity } = req.body;
        const analysis = await aiService.analyzeSisuChances(score, desiredCourse, preferredUniversity);
        res.json(analysis);
    } catch (error) {
        console.error('Erro na análise SiSU:', error);
        res.status(500).json({ error: 'Erro na análise SiSU.' });
    }
});

app.post('/api/ai/study-plan', authenticateToken, async (req, res) => {
    try {
        const { results } = req.body;
        const plan = await aiService.generateStudyPlan(results);
        res.json(plan);
    } catch (error) {
        console.error('Erro ao gerar plano de estudos:', error);
        res.status(500).json({ error: 'Erro ao gerar plano de estudos.' });
    }
});

app.post('/api/ai/essay-theme', authenticateToken, async (req, res) => {
    try {
        const theme = await aiService.generateEssayTheme();
        res.json(theme);
    } catch (error) {
        console.error('Erro ao gerar tema de redação:', error);
        res.status(500).json({ error: 'Erro ao gerar tema de redação.' });
    }
});

app.post('/api/ai/evaluate-essay', authenticateToken, async (req, res) => {
    try {
        const { theme, essayText } = req.body;
        const evaluation = await aiService.evaluateEssay(theme, essayText);
        res.json(evaluation);
    } catch (error) {
        console.error('Erro ao avaliar redação:', error);
        res.status(500).json({ error: 'Erro ao avaliar redação.' });
    }
});

app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
        const { history, newMessage } = req.body;
        const response = await aiService.getChatResponse(history, newMessage);
        res.json({ text: response });
    } catch (error) {
        console.error('Erro no chat:', error);
        res.status(500).json({ error: 'Erro no chat.' });
    }
});

app.post('/api/ai/study-map', authenticateToken, async (req, res) => {
    console.log('Route: /api/ai/study-map hit', req.body);
    try {
        const { subject, topic } = req.body;
        console.log(`Generating study map for: ${subject} - ${topic}`);
        const map = await aiService.generateStudyMap(subject, topic);
        console.log('Study map generated successfully');
        res.json(map);
    } catch (error) {
        console.error('Erro ao gerar mapa de estudos:', error);
        res.status(500).json({ error: 'Erro ao gerar mapa de estudos.' });
    }
});

app.post('/api/ai/grade-1000-example', authenticateToken, async (req, res) => {
    try {
        const { theme } = req.body;
        const example = await aiService.getGrade1000Example(theme);
        res.json(example);
    } catch (error) {
        console.error('Erro ao obter exemplo nota 1000:', error);
        res.status(500).json({ error: 'Erro ao obter exemplo nota 1000.' });
    }
});

app.get('/api/health', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', e2eMode: E2E_MODE, db: 'ok' });
    } catch {
        res.status(503).json({ status: 'degraded', e2eMode: E2E_MODE, db: 'error' });
    }
});

export { app };

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} `);
});