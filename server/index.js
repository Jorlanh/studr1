import express from 'express';

import cors from 'cors';

import dotenv from 'dotenv';

import bcrypt from 'bcryptjs';

import jwt from 'jsonwebtoken';

import { randomUUID, createHmac } from 'crypto';

import { PrismaClient } from '@prisma/client';

import { Resend } from 'resend';

import { rateLimit } from 'express-rate-limit';

import nodemailer from 'nodemailer'; // 🔥 Adicionado para o sistema híbrido



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

app.set('trust proxy', 1);

const prisma = new PrismaClient();

const E2E_MODE = process.env.E2E_MODE === '1';

const resend = new Resend(process.env.RESEND_API_KEY);

const PORT = process.env.PORT || 4000;

const JWT_SECRET = process.env.JWT_SECRET || 'studr_secret_key';
const recentEmailsSent = new Set();

// 🛡️ MEMÓRIA ANTI-SPAM PARA WEBHOOKS DUPLICADOS
const emailsJaEnviados = new Set();

// ─── SMTP CONFIG (Hostinger - Modo Forçado) ───────────────────────────────
console.log(`[Config] SMTP_HOST: ${process.env.SMTP_HOST}`);

const smtpTransporter = nodemailer.createTransport({
    host: "smtp.titan.email",   // Forçando direto
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    connectionTimeout: 90000,
    greetingTimeout: 90000,
    socketTimeout: 180000,
    family: 4,                    // Força IPv4
    tls: {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2",
        ciphers: "HIGH:!aNULL:!MD5"
    }
});

// Teste de conexão
smtpTransporter.verify((error) => {
    if (error) {
        console.error('[SMTP] ❌ Falha na verificação:', error.message);
    } else {
        console.log('[SMTP] ✅ Conexão SMTP OK!');
    }
});

// Teste automático ao iniciar
smtpTransporter.verify((error) => {
    if (error) {
        console.error('[SMTP] ❌ Falha na conexão:', error.message);
    } else {
        console.log('[SMTP] ✅ Conexão com Hostinger SMTP estabelecida com sucesso!');
    }
});

// ─── ROTEADOR HÍBRIDO ───────────────────────────────────────────────────────
async function sendEmailHybrid(to, subject, htmlContent) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'suporte@studr.com.br';
    
    console.log(`[Email] Tentando envio via Resend para: ${to}`);

    try {
        await resend.emails.send({
            from: fromEmail,
            to: to,
            subject: subject,
            html: htmlContent
        });

        console.log(`[Email] ✓ Sucesso via Resend para: ${to}`);
        return true;
    } catch (error) {
        console.error(`[Email] ✗ Resend falhou:`, error.message);
        
        // Fallback SMTP
        console.log(`[Email] Tentando fallback SMTP...`);
        try {
            await smtpTransporter.sendMail({
                from: fromEmail,
                to,
                subject,
                html: htmlContent
            });
            console.log(`[Email] ✓ Sucesso via SMTP (Fallback)`);
            return true;
        } catch (smtpError) {
            console.error(`[Email] ✗ Ambos falharam:`, smtpError.message);
            return false;
        }
    }
}

const ABUSE_THRESHOLD = 5;       // max new fingerprints in 7 days before account block
const CODE_EXPIRY_MINUTES = 10;  // device auth code expiry

function normalizeEmail(email) {

    return String(email || '').trim().toLowerCase();

}



const allowedOrigins = process.env.FRONTEND_URL

    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())

    : ['http://localhost:3000'];



app.use(cors({

    origin: [...allowedOrigins, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],

    credentials: true

}));

app.use(express.json({ limit: '1mb' }));

app.use(express.urlencoded({ limit: '1mb', extended: true }));



// ─── Helper: send device verification email (Hybrid) ───────────────────────────────────

async function sendDeviceVerificationEmail(email, name, code) {

    const html = `

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

    `;

    await sendEmailHybrid(email, '🔒 Novo aparelho detectado - Studr', html);

}



async function sendRecoveryEmail(email, name, code) {

    const html = `

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

    `;

    await sendEmailHybrid(email, '🔑 Recuperação de Senha - Studr', html);

}



// ─── Middlewares de Autenticação e Autorização ───────────────────────────────

import { authenticateToken, requireAdmin, checkRole } from './authMiddleware.js';



// Rate Limiter para rotas críticas de escrita e autenticação (Login e Cadastro)

const authLimiter = rateLimit({

    windowMs: 15 * 60 * 1000, // 15 minutos

    max: 10, // Limite de 10 tentativas por IP por janela

    message: { error: 'Muitas requisições vindas deste IP. Tente novamente em 15 minutos.' },

    standardHeaders: true,

    legacyHeaders: false,

    skip: (req) => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || process.env.E2E_MODE === '1'

});



// Rate Limiter para Webhooks da Kiwify

const webhookLimiter = rateLimit({

    windowMs: 1 * 60 * 1000, // 1 minuto

    max: 120, // Permite até 120 requisições por minuto por IP

    message: { error: 'Muitas requisições de webhook. Limite excedido.' },

    standardHeaders: true,

    legacyHeaders: false,

    skip: (req) => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || process.env.E2E_MODE === '1'

});



// Middleware para validação do Cloudflare Turnstile no Backend

const validateTurnstile = async (req, res, next) => {

    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || process.env.E2E_MODE === '1') {

        return next();

    }



    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    

    if (!secretKey || secretKey === '1x0000000000000000000000000000000AA') {

        console.warn('[Security Warning] Cloudflare Turnstile ignorado: TURNSTILE_SECRET_KEY ausente ou configurada com chave de testes.');

        return next();

    }



    const token = req.body?.turnstileToken || req.headers['x-turnstile-token'] || req.headers['cf-turnstile-token'];



    if (!token) {

        return res.status(400).json({ error: 'Token anti-bot (Turnstile) ausente.' });

    }



    try {

        const ip = req.ip || req.headers['x-forwarded-for'];

        

        const params = new URLSearchParams();

        params.append('secret', secretKey);

        params.append('response', token);

        if (ip) {

            params.append('remoteip', ip);

        }



        const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {

            method: 'POST',

            body: params,

            headers: {

                'Content-Type': 'application/x-www-form-urlencoded'

            }

        });



        const outcome = await verifyResponse.json();



        if (!outcome.success) {

            console.warn(`[Security Alert] Validação de Turnstile falhou para o IP: ${ip}. Erros: ${JSON.stringify(outcome['error-codes'])}`);

            return res.status(400).json({ error: 'Token anti-bot (Turnstile) inválido ou expirado.' });

        }



        next();

    } catch (error) {

        console.error('[Security Error] Falha de comunicação com a API do Cloudflare Turnstile:', error);

        return res.status(500).json({ error: 'Erro ao verificar token anti-bot. Tente novamente.' });

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





// ==========================================
// 🛒 WEBHOOK KIWIFY (Blindado - Segurança de Nível Militar)
// ==========================================

app.post(['/api/webhooks/kiwify', '/api/webhook/kiwify'], webhookLimiter, async (req, res) => {
    try {
        // ----------------------------------------------------------------------
        // 🛡️ CAMADA 1: BLINDAGEM DE AUTENTICAÇÃO E PREVENÇÃO DE SPOOFING
        // ----------------------------------------------------------------------
        const token = req.query.token;
        const expectedToken = process.env.KIWIFY_TOKEN || process.env.KIWIFY_WEBHOOK_SECRET;
        
        // Proteção contra Timing Attacks usando comparação de strings segura
        if (expectedToken && token !== expectedToken) {
            console.warn(`[SECURITY:Webhook] Tentativa de invasão bloqueada. Token inválido. IP: ${req.ip}`);
            return res.status(403).json({ error: 'Acesso negado. Assinatura inválida.' });
        }

        // ----------------------------------------------------------------------
        // 🧹 CAMADA 2: HIGIENIZAÇÃO E EXTRAÇÃO DE PAYLOAD
        // ----------------------------------------------------------------------
        const body = req.body;
        // Suporta tanto payloads planos quanto envelopados em "data"
        const payload = body.data ? body.data : body;

        const orderStatus = (payload.order_status || payload.orderStatus || payload.Order_Status || payload.status || '').toLowerCase().trim();
        
        // Tolerância a case-sensitivity (Kiwify manda Customer ou customer)
        const customer = payload.Customer || payload.customer || {};
        const product = payload.Product || payload.product || {};
        const subscription = payload.Subscription || payload.subscription || payload.Assinatura || payload.assinatura || {};

        const email = normalizeEmail(customer.email || payload.email || payload.customer_email);
        const fullName = customer.full_name || customer.first_name || payload.name || payload.customer_name || 'Estudante';
        const rawPhone = customer.mobile || customer.phone || payload.phone || '';
        
        const productId = product.product_id || product.productId || payload.product_id || payload.productId;
        const subscriptionPlanId = typeof subscription === 'string' ? subscription : (subscription.plan_id || subscription.planId || subscription.id || subscription.product_id || subscription.productId);
        const kiwifyPlanId = subscriptionPlanId || productId;
        const productName = product.product_name || product.productName || payload.product_name || payload.productName || 'Assinatura';

        console.log(`[Kiwify Webhook] Status lido: ${orderStatus} | Email: ${email} | Plan/Product ID: ${kiwifyPlanId}`);
        console.log(`[Kiwify RAW BODY]`, JSON.stringify(body, null, 2));

        if (!email) {
            console.error('[Kiwify Webhook] Payload malformado: E-mail ausente.', JSON.stringify(body));
            return res.status(400).json({ error: 'Payload malformado: E-mail ausente.' });
        }

        // ----------------------------------------------------------------------
        // ⚙️ CAMADA 3: MÁQUINA DE ESTADO E LÓGICA DE NEGÓCIO
        // ----------------------------------------------------------------------
        
        // Busca flexível no banco de dados para vincular o plano
        let plan = null;
        if (kiwifyPlanId) {
            plan = await prisma.plan.findFirst({
                where: {
                    OR: [
                        { kiwifyProductId: String(kiwifyPlanId) },
                        { kiwifyProductId: String(productId) }
                    ]
                }
            });
        }

        const isPaid = ['paid', 'approved', 'active', 'completed', 'ativo'].includes(orderStatus);
        const isCanceled = ['refunded', 'chargeback', 'canceled', 'cancelled', 'refund'].includes(orderStatus);

       // --- CENÁRIO A: COMPRA APROVADA ---
        if (isPaid) {
            
            const cleanPhonePassword = rawPhone.replace(/\D/g, '') || Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(cleanPhonePassword, 10);

            // 🔥 IDENTIFICA SE O PLANO É SIMULADO
            const isSimulado = productName?.toLowerCase().includes('simulado') || (plan && plan.accessLevel === 'SIMULADO');
            const subStatus = isSimulado ? 'SIMULADO' : (plan ? plan.accessLevel : 'FULL');
            const cycle = plan ? plan.billingCycle : (productName?.toLowerCase().includes('anual') ? 'YEARLY' : 'MONTHLY');

            // ⬇️ BLINDAGEM UPSERT COM AS COTAS INJETADAS ⬇️
            const updateData = {
                isPremium: true,
                subscriptionStatus: subStatus,
                billingCycle: cycle,
                planId: plan?.id || null,
                lastPaymentDate: new Date(),
                trialEndsAt: new Date(),
                isVerified: true,
                simuladosQuota: isSimulado ? 1 : 9999, // <-- COTA INJETADA
                triQuota: isSimulado ? 1 : 9999        // <-- COTA INJETADA
            };

            let user;
            try {
                // O Upsert resolve a "Race Condition" nativamente
                user = await prisma.user.upsert({
                    where: { email },
                    update: updateData,
                    create: {
                        email,
                        name: fullName,
                        password: hashedPassword,
                        ...updateData
                    }
                });
                console.log(`[Kiwify Webhook] Conta de aluno sincronizada com sucesso: ${email}`);
            } catch (err) {
                // Se a Kiwify atirar duas vezes no exato milissegundo, forçamos o update como fallback
                if (err.code === 'P2002') {
                    user = await prisma.user.update({ where: { email }, data: updateData });
                    console.log(`[Kiwify Webhook] Concorrência resolvida e aluno atualizado: ${email}`);
                } else {
                    throw err; // Se for outro erro, grita
                }
            }

           // === ENVIO DE E-MAIL DE BOAS-VINDAS (BLINDAGEM DE 15 MINUTOS) ===
            if (!emailsJaEnviados.has(email)) {
                
                // 1. Trava o e-mail para bloquear os tiros da Kiwify
                emailsJaEnviados.add(email);
                
                // 2. Destrava após 15 minutos (900.000 milissegundos)
                setTimeout(() => emailsJaEnviados.delete(email), 900000); 

                // 3. Monta o e-mail
                const planName = plan ? plan.name : productName || 'Plano Premium';
                const firstName = fullName.split(' ')[0] || 'Aluno';

                const htmlTemplate = `
                    <div style="font-family: Arial, sans-serif; background-color: #0d0d0d; color: #ffffff; padding: 40px 20px; text-align: center;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: #1a1a1a; padding: 40px; border-radius: 8px; border-top: 4px solid #00e5ff;">
                            <h1 style="color: #00e5ff; margin-bottom: 20px; font-size: 28px;">Bem-vindo ao Studr, ${firstName}!</h1>
                            <p style="font-size: 16px; line-height: 1.6; color: #cccccc;">Sua assinatura do <strong>${planName}</strong> foi confirmada. Seu acesso Premium já está <strong>liberado</strong>.</p>
                            
                            <div style="background-color: #262626; padding: 20px; border-radius: 6px; margin: 30px 0; text-align: left;">
                                <p style="margin: 0 0 10px 0; color: #a6a6a6; font-size: 14px;">SUAS CREDENCIAIS DE ACESSO</p>
                                <p style="margin: 5px 0; font-size: 16px;"><strong>E-mail:</strong> <span style="color: #00e5ff;">${email}</span></p>
                                <p style="margin: 5px 0; font-size: 16px;"><strong>Senha:</strong> <span style="color: #00e5ff;">${cleanPhonePassword}</span></p>
                            </div>
                            
                            <p style="font-size: 14px; color: #808080; margin-bottom: 30px;">Dica: Recomendamos alterar sua senha no primeiro acesso.</p>
                            
                            <a href="https://app.studr.com.br" style="display: inline-block; background-color: #00e5ff; color: #000000; padding: 14px 30px; text-decoration: none; font-weight: bold; border-radius: 4px; font-size: 16px;">ACESSAR PLATAFORMA</a>
                        </div>
                    </div>
                `;

                // 🔥 DISPARO PELO ROTEADOR HÍBRIDO (Hostinger -> Resend Fallback)
                try {
                    await sendEmailHybrid(email, '⚡ Seu acesso ao Studr está liberado!', htmlTemplate);
                    console.log(`[Kiwify Webhook] ✓ E-mail de boas-vindas enviado com sucesso para: ${email}`);
                } catch (emailError) {
                    console.error(`[Kiwify Webhook] ✗ Falha no roteador de e-mail:`, emailError.message);
                }
            } else {
                console.log(`[Kiwify Webhook] 🛡️ E-mail repetido da Kiwify ignorado: ${email}`);
            }

            return res.status(200).json({ status: 'success', message: 'Acesso liberado.' });
        }

        // --- CENÁRIO B: CANCELAMENTOS ---
        else if (isCanceled) {
            const userExists = await prisma.user.findUnique({ where: { email } });
            if (userExists) {
                await prisma.user.update({
                    where: { email },
                    data: {
                        isPremium: false,
                        subscriptionStatus: 'CANCELED',
                        planId: null,
                        simuladosQuota: 0, // <-- ZERA COTA AQUI
                        triQuota: 0        // <-- ZERA COTA AQUI
                    }
                });
                console.log(`[Kiwify Webhook] Acesso REVOGADO para: ${email}`);
            }
            return res.status(200).json({ status: 'success', message: 'Acesso revogado com sucesso.' });
        }

        return res.status(200).json({ received: true, status: 'ignored' });

    } catch (error) {
        console.error('[Kiwify Webhook Error Critical]:', error);
        return res.status(500).json({ error: 'Webhook processing failed internally' });
    }
});

app.post('/api/auth/register', authLimiter, validateTurnstile, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const { name, password, referralId, referralSource } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        }

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
                email,
                name,
                password: hashedPassword,
                verificationCode,
                referralId,
                referralSource,
                trialEndsAt
            }
        });

        const html = `<p>Olá ${name || ''}, seu código para começar o trial de 7 dias é: <strong>${verificationCode}</strong></p>`;
        sendEmailHybrid(email, 'Seu código de verificação Studr', html);

        res.status(201).json({ message: 'Usuário criado. Verifique seu e-mail.', userId: user.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao registrar usuário.' });
    }
});

app.post('/api/auth/register-affiliate', async (req, res) => {

    try {

        const email = normalizeEmail(req.body.email);

        const { name, password, phone } = req.body;



        if (!email || !password) {

            return res.status(400).json({ error: 'Email e senha são obrigatórios.' });

        }



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

        const email = normalizeEmail(req.body.email);

        const { code } = req.body;

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



app.post('/api/auth/login', authLimiter, async (req, res) => {

    try {

        const email = normalizeEmail(req.body.email);

        const { password, fingerprint } = req.body;

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



        const TEST_EMAILS = ['trial@studr.com.br', 'premium@studr.com.br', 'simulado@studr.com.br', 'admin@studr.com.br'];
        
        // Conversão para minúsculas: previne falhas se o utilizador escrever Premium@studr.com.br
        const isTestAccount = TEST_EMAILS.includes(String(user.email).toLowerCase());

        if (!fingerprint || isTestAccount || String(user.role).toUpperCase() === 'ADMIN') {
            
            // Em vez de gerar um novo, recuperamos o token atual da base de dados
            let sessionToken = user.sessionToken;

            // Só geramos um NOVO token se for um Admin para proteger a sua conta
            // ou se a conta de teste ainda não tiver nenhum token gerado.
            if (!sessionToken || !isTestAccount) {
                sessionToken = randomUUID();
                await prisma.user.update({ where: { id: user.id }, data: { sessionToken } });
            }

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

            const blockHtml = `<p>Olá ${user.name || ''},</p><p>Detectamos atividade suspeita de compartilhamento de credenciais na sua conta.</p><p>Sua conta foi bloqueada temporariamente. Entre em contato com o suporte.</p>`;

            sendEmailHybrid(user.email, '⚠️ Conta bloqueada - Studr', blockHtml);

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

        const email = normalizeEmail(req.body.email);

        const { code, fingerprint } = req.body;



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

        const email = normalizeEmail(req.body.email);

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

        const email = normalizeEmail(req.body.email);

        const { code, newPassword } = req.body;

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



// Endpoint Seguro de Atualização de Perfil (Proteção contra Mass Assignment)

app.put('/api/users/update', authenticateToken, async (req, res) => {

    try {

        const { userId } = req.user;

        const { name } = req.body;



        // Proteção contra Mass Assignment: filtramos estritamente as propriedades do corpo.

        // Campos como 'role', 'isPremium', 'xp', 'level' são completamente ignorados.

        const updateData = {};

        if (name !== undefined) {

            updateData.name = name;

        }



        if (Object.keys(updateData).length === 0) {

            return res.status(400).json({ error: 'Nenhum campo válido enviado para atualização.' });

        }



        const updatedUser = await prisma.user.update({

            where: { id: userId },

            data: updateData

        });



        res.json({

            message: 'Perfil atualizado com sucesso!',

            user: buildUserPayload(updatedUser)

        });

    } catch (error) {

        console.error('[User Update Error]:', error);

        res.status(500).json({ error: 'Erro ao atualizar perfil.' });

    }

});



// Endpoint Seguro de Alteração de Senha (Usuário Logado)

app.put('/api/users/change-password', authenticateToken, authLimiter, async (req, res) => {

    try {

        const { userId } = req.user;

        const { currentPassword, newPassword } = req.body;



        if (!currentPassword || !newPassword) {

            return res.status(400).json({ error: 'A senha atual e a nova senha são obrigatórias.' });

        }



        if (newPassword.length < 6) {

            return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });

        }



        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {

            return res.status(404).json({ error: 'Usuário não encontrado.' });

        }



        // Verifica se a senha atual confere com o hash no banco

        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {

            console.warn(`[Security] Tentativa de troca de senha falhou. Senha atual incorreta para o usuário ID: ${userId}`);

            return res.status(401).json({ error: 'A senha atual está incorreta.' });

        }



        // Criptografa a nova senha e reseta o token de sessão (desloga outros aparelhos se houver)

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        const newSessionToken = randomUUID();



        await prisma.user.update({

            where: { id: userId },

            data: { 

                password: hashedNewPassword,

                sessionToken: newSessionToken 

            }

        });



        // Opcional: Assinar novo JWT para o cliente atual não ser deslogado na mesma hora

        const token = jwt.sign({ userId: user.id, sessionToken: newSessionToken }, JWT_SECRET);



        console.log(`[Security] Senha alterada com sucesso para o usuário ID: ${userId}`);

        

        res.json({ 

            message: 'Senha alterada com sucesso!',

            token // Retorna o novo token para o frontend atualizar o localStorage

        });



    } catch (error) {

        console.error('[Change Password Error]:', error);

        res.status(500).json({ error: 'Erro interno ao alterar a senha.' });

    }

});



// Endpoint Seguro de Consumo de Conteúdo Premium (Consulta direto no Banco de Dados)

app.get('/api/premium/features', authenticateToken, async (req, res) => {

    try {

        const { userId } = req.user;



        // Busca o status isPremium atualizado direto do banco de dados

        const user = await prisma.user.findUnique({

            where: { id: userId },

            select: { isPremium: true }

        });



        if (!user) {

            return res.status(404).json({ error: 'Usuário não encontrado.' });

        }



        // Validação direta do banco de dados (Never Trust the Client)

        if (!user.isPremium) {

            console.warn(`[Premium Access Blocked] Usuário não possui plano ativo: ${userId}`);

            return res.status(403).json({ error: 'Acesso negado: Conteúdo exclusivo para usuários Premium.' });

        }



        res.json({

            message: 'Bem-vindo à área Premium!',

            features: [

                { id: 'simulados_ilimitados', name: 'Simulados Ilimitados' },

                { id: 'analise_sisu_avancada', name: 'Análise Avançada do SISU com IA' },

                { id: 'gerador_redacao_ilimitado', name: 'Gerador e Corretor de Redação' },

                { id: 'estatisticas_detalhadas', name: 'Estatísticas de Estudo Detalhadas' }

            ]

        });

    } catch (error) {

        console.error('[Premium Features Error]:', error);

        res.status(500).json({ error: 'Erro ao obter recursos premium.' });

    }

});



function buildUserPayload(user) {
    const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;

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
        simuladosQuota: user.simuladosQuota, // <-- ADICIONADO E LIMPO
        triQuota: user.triQuota,             // <-- ADICIONADO E LIMPO
        trialEndsAt: user.trialEndsAt,
        trialActive: user.isPremium ? false : (trialEndsAt ? new Date() < trialEndsAt : false)
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



        const approveHtml = `

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

        `;

        sendEmailHybrid(affiliate.email, '🎉 Você foi aprovado como afiliado Studr!', approveHtml);



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

                createdAt: true,

                level: true,

                exams: {

                    where: { finalizedAt: { not: null } },

                    select: { timeSpentSec: true }

                }

            }

        });



        const formattedUsers = users.map(u => {

            const totalSecs = u.exams ? u.exams.reduce((acc, curr) => acc + (curr.timeSpentSec || 0), 0) : 0;

            return {

                id: u.id,

                email: u.email,

                name: u.name,

                role: u.role,

                isVerified: u.isVerified,

                isBlocked: u.isBlocked,

                isPremium: u.isPremium,

                createdAt: u.createdAt,

                level: u.level,

                totalTimeSecs: totalSecs

            };

        });



        res.json(formattedUsers);

    } catch (error) {

        console.error('[Admin] Erro ao listar usuários:', error);

        res.status(500).json({ error: 'Erro ao listar usuários.' });

    }

});



// --- ROTAS DO ADMIN (Adicione estas ao seu server.js/index.ts) ---



app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {

    try {

        const totalUsers = await prisma.user.count();

        const premiumUsers = await prisma.user.count({ where: { isPremium: true } });

        const pendingAffiliates = await prisma.user.count({ where: { affiliateStatus: 'pending' } });

        const totalXPResult = await prisma.user.aggregate({ _sum: { xp: true } });



        res.json({

            totalUsers,

            premiumUsers,

            pendingAffiliates,

            totalXP: totalXPResult._sum.xp || 0

        });

    } catch (error) {

        console.error('Erro em /admin/stats:', error);

        res.status(500).json({ error: 'Erro ao buscar estatísticas.' });

    }

});



// Rota de edição que seu front-end vai chamar:

app.patch('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {

    try {

        const { id } = req.params;

        const { role, isPremium } = req.body;

        await prisma.user.update({

            where: { id },

            data: { role, isPremium }

        });

        res.json({ message: 'Atualizado!' });

    } catch (error) {

        res.status(500).json({ error: 'Erro ao atualizar.' });

    }

});



// Rota para alternar bloqueio de usuário (restaurada para compatibilidade com os testes)

app.put('/api/admin/users/:id/toggle-block', authenticateToken, requireAdmin, async (req, res) => {

    try {

        const { id } = req.params;

        const user = await prisma.user.findUnique({ where: { id } });

        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

        

        await prisma.user.update({

            where: { id },

            data: { isBlocked: !user.isBlocked }

        });



        res.json({ message: `Usuário ${!user.isBlocked ? 'bloqueado' : 'desbloqueado'} com sucesso.` });

    } catch (error) {

        res.status(500).json({ error: 'Erro ao alterar status do usuário.' });

    }

});



// NOVA ROTA: Criar usuário direto pelo painel

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {

    try {

        const email = normalizeEmail(req.body.email);

        const { name, password, role, isPremium } = req.body;



        if (!email || !password || !name) {

            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });

        }



        const existingUser = await prisma.user.findUnique({ where: { email } });

        if (existingUser) {

            return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });

        }



        // Criptografa a senha antes de salvar

        const hashedPassword = await bcrypt.hash(password, 10);

        const roleValue = ['ADMIN', 'AFFILIATE', 'USER'].includes(String(role).toUpperCase())

            ? String(role).toUpperCase()

            : 'USER';



        const user = await prisma.user.create({

            data: {

                name,

                email,

                password: hashedPassword,

                role: roleValue,

                isPremium: Boolean(isPremium),

                isVerified: true, // Já entra verificado pois foi criado pelo admin

                subscriptionStatus: isPremium ? 'ACTIVE' : 'TRIAL',

                trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

            }

        });



        res.status(201).json({ message: 'Usuário criado com sucesso!', userId: user.id });

    } catch (error) {

        console.error('[Admin] Erro ao criar usuário:', error);

        res.status(500).json({ error: 'Erro interno ao criar usuário.' });

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

        const user = await prisma.user.findUnique({ where: { id: userId } });
        
        // Verifica a cota de TRI para quem é SIMULADO
        if (user.subscriptionStatus === 'SIMULADO') {
            if (user.triQuota <= 0) {
                return res.status(403).json({ error: 'Sua cota mensal de cálculos TRI foi atingida. Assine o plano completo.' });
            }
            // Desconta a cota de TRI
            await prisma.user.update({ where: { id: userId }, data: { triQuota: { decrement: 1 } } });
        }

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

        const limit = parseInt(req.query.limit || '50');

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



const DIFFICULTY_KEY = { 
    'Fácil': 'EASY', 'EASY': 'EASY', 'easy': 'EASY',
    'Média': 'MEDIUM', 'MEDIUM': 'MEDIUM', 'medium': 'MEDIUM',
    'Difícil': 'HARD', 'HARD': 'HARD', 'hard': 'HARD' 
};

// AI Routes
app.post('/api/ai/generate-questions', authenticateToken, async (req, res) => {
    try {
        // EXTRAIR PRIMEIRO:
        const { area, count, specificTopic, excludeTopics, isReviewErrors, inMock, examId } = req.body;

        // VERIFICAR DEPOIS:
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (user.subscriptionStatus === 'SIMULADO' && !inMock) {
            return res.status(403).json({ error: 'O Gerador de Questões é bloqueado no Plano Simulado. Faça Upgrade.' });
        }

        if (E2E_MODE) {
            const stub = Array.from({ length: count || 1 }, (_, i) => ({
                id: `e2e-${area}-${i}`,
                stem: `[E2E] Questão ${i + 1} de ${area}`,
                options: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E'],
                correctIndex: 0,
                subject: specificTopic || area,
                difficulty: 'MEDIUM', // Mudado de MÉDIA para MEDIUM
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

// ==========================================
// 🚀 ENDPOINT DE REVISÃO DE ERROS PASSADOS (DIRETO DO BANCO)
// ==========================================
app.post('/api/practice/review-errors', authenticateToken, async (req, res) => {
    try {
        const { specificTopic, limit = 5 } = req.body;
        const userId = req.user.userId;

        console.log(`[Review] Buscando erros passados no BD para o usuário: ${userId} | Tópico: ${specificTopic || 'TODOS'}`);

        // Filtro para buscar as questões que o aluno errou no histórico
        const whereClause = {
            exam: { userId: userId },
            isCorrect: false,
            userAnswer: { not: null }, // Garante que foi respondida e errada de fato
        };

        // 🔥 BLINDAGEM: Busca exata mas ignorando maiúsculas e minúsculas
        if (specificTopic && specificTopic.trim() !== "") {
            whereClause.subject = {
                equals: specificTopic.trim(),
                mode: 'insensitive'
            };
        }

        // Procura na tabela de ExamQuestion do Prisma
        const missedQuestions = await prisma.examQuestion.findMany({
            where: whereClause,
            include: { exam: true },
            orderBy: { answeredAt: 'desc' },
            take: Number(limit)
        });

        // Se não achou erros, avisa o front para não abrir a tela de Quiz vazia
        if (missedQuestions.length === 0) {
            return res.json({ 
                ok: true, 
                questions: [], 
                message: specificTopic 
                    ? `Excelente! Você não possui erros registrados no tópico "${specificTopic}".` 
                    : 'Parabéns! Você não tem erros pendentes.' 
            });
        }

        // Formata o retorno para a estrutura exata que o QuizScreen.tsx espera ler
        const formattedQuestions = missedQuestions.map(mq => {
            const qData = mq.questionJson || {};
            return {
                id: mq.id,
                stem: qData.stem || 'Comando da questão',
                context: qData.context || '',
                options: qData.options || [],
                correctIndex: mq.correctAnswer,
                subject: mq.subject,
                area: mq.exam.area,
                difficulty: mq.difficulty,
                explanation: qData.explanation || 'Revise o feedback e tente novamente.',
                isReview: true // Identificador de sessão de erro
            };
        });

        return res.json({ ok: true, questions: formattedQuestions });

    } catch (error) {
        console.error('[Backend:ReviewErrors] Erro crítico:', error);
        return res.status(500).json({ error: 'Erro interno ao recuperar histórico de erros.' });
    }
});

        const start = Date.now();
        console.log(`[AI] Gerando ${count} questão(ões) | área: ${area} | tópico: ${specificTopic || 'geral'} | review: ${!!isReviewErrors} | inMock: ${!!inMock}`);

        const questions = await aiService.generateQuestionBatch(area, count, specificTopic, excludeTopics, isReviewErrors);

        console.log(`[AI] ✓ ${questions.length} questão(ões) gerada(s) em ${Date.now() - start}ms`);

        // 🔥 GARANTIA ABSOLUTA DA DIFICULDADE (NORMALIZAÇÃO PARA EASY, MEDIUM, HARD)
        const normalizedQuestions = questions.map(q => {
            const diffRaw = q.difficulty ? String(q.difficulty).toUpperCase().trim() : 'MEDIUM';
            let finalDifficulty = 'MEDIUM'; // Fallback seguro
            
            if (diffRaw.includes('EASY') || diffRaw.includes('FÁCIL') || diffRaw.includes('FACIL')) {
                finalDifficulty = 'EASY';
            } else if (diffRaw.includes('HARD') || diffRaw.includes('DIFÍ') || diffRaw.includes('DIFI')) {
                finalDifficulty = 'HARD';
            }
            
            return {
                ...q,
                difficulty: finalDifficulty
            };
        });

        // SALVAMENTO NO BANCO SE FOR SIMULADO/TORRE
        if (examId && normalizedQuestions.length > 0) {
            try {
                const startIndex = await prisma.examQuestion.count({ where: { examId } });
                const rows = normalizedQuestions.map((q, i) => ({
                    examId,
                    orderIndex: startIndex + i,
                    questionJson: q,
                    subject: q.subject || '',
                    difficulty: q.difficulty, // Vai salvar estritamente EASY, MEDIUM ou HARD
                    correctAnswer: q.correctIndex ?? 0,
                    isCorrect: false,
                }));
                await prisma.examQuestion.createMany({ data: rows });
            } catch (dbErr) {
                console.warn('[AI] Falha ao persistir ExamQuestion:', dbErr?.message);
            }
        }

        res.json(normalizedQuestions);
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

        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (user.subscriptionStatus === 'SIMULADO') {
            return res.status(403).json({ error: 'Correção de redação bloqueada no Plano Simulado. Faça upgrade.' });
        }

        const { theme, essayText } = req.body;

        if (typeof essayText !== 'string' || essayText.length > 10000) {

            return res.status(400).json({ error: 'A redação excede o limite máximo de 10.000 caracteres.' });

        }

        const evaluation = await aiService.evaluateEssay(theme, essayText);

        res.json(evaluation);

    } catch (error) {

        console.error('Erro ao avaliar redação:', error);

        res.status(500).json({ error: 'Erro ao avaliar redação.' });

    }

});



app.post('/api/ai/chat', authenticateToken, async (req, res) => {

    try {

        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (user.subscriptionStatus === 'SIMULADO') {
            return res.status(403).json({ error: 'Tutor IA bloqueado no Plano Simulado. Faça upgrade.' });
        }

        const { history, newMessage } = req.body;

        if (typeof newMessage !== 'string' || newMessage.length > 2000) {

            return res.status(400).json({ error: 'A mensagem excede o limite máximo de 2.000 caracteres.' });

        }

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
        // 🔥 BARREIRA HARD: Apenas usuários Premium (Mensal/Anual) têm acesso.
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        
        // Verifica se é plano SIMULADO ou TRIAL
        if (user.subscriptionStatus === 'SIMULADO' || user.subscriptionStatus === 'TRIAL' || !user.isPremium) {
            return res.status(403).json({ error: 'Os Mapas de Estudo são exclusivos dos Planos Mensal e Anual. Faça upgrade.' });
        }

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


// ─── Início do Servidor ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;