import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ─── Plan limits ─────────────────────────────────────────────────────────────
const PLAN_LIMITS = {
    TRIAL: {
        questionsPerDay: 10,
        mocksPerWeek: 1,
    },
    MOCK_ONLY: {
        questionsPerDay: 0,     // practice not available
        mocksPerMonth: 1,
    },
    PREMIUM: {
        questionsPerDay: Infinity,
        mocksPerWeek: Infinity,
    },
    EXPIRED: {
        questionsPerDay: 0,
        mocksPerWeek: 0,
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// Milliseconds since start of Monday of current week
const startOfWeekMs = () => {
    const now = new Date();
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Mon
    now.setDate(now.getDate() - day);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
};

const startOfMonthMs = () => {
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
};

// ─── Plan detection ───────────────────────────────────────────────────────────
export const getUserPlan = (user) => {
    if (user.isPremium) return 'PREMIUM';
    if (user.subscriptionStatus === 'MOCK_ONLY') return 'MOCK_ONLY';
    if (user.trialEndsAt && new Date() < new Date(user.trialEndsAt)) return 'TRIAL';
    return 'EXPIRED';
};

// ─── Check & consume question (atomic via upsert pattern) ─────────────────────
// Returns { allowed: boolean, reason?: string, remaining?: number }
export const checkAndConsumeQuestion = async (userId, questionsRequested = 1) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            isPremium: true,
            subscriptionStatus: true,
            trialEndsAt: true,
            trialQuestionsDate: true,
            trialQuestionsUsed: true,
        }
    });

    if (!user) return { allowed: false, reason: 'USER_NOT_FOUND' };

    const plan = getUserPlan(user);

    if (plan === 'EXPIRED') return { allowed: false, reason: 'TRIAL_EXPIRED' };
    if (plan === 'PREMIUM') return { allowed: true };
    if (plan === 'MOCK_ONLY') return { allowed: false, reason: 'PLAN_DOES_NOT_INCLUDE_PRACTICE' };

    // TRIAL: check daily counter
    const today = todayStr();
    const currentDate = user.trialQuestionsDate;
    const currentCount = currentDate === today ? (user.trialQuestionsUsed || 0) : 0;

    const limit = PLAN_LIMITS.TRIAL.questionsPerDay;
    if (currentCount >= limit) {
        return { allowed: false, reason: 'DAILY_LIMIT_REACHED', used: currentCount, limit };
    }

    // Consume
    await prisma.user.update({
        where: { id: userId },
        data: {
            trialQuestionsDate: today,
            trialQuestionsUsed: currentDate === today ? { increment: questionsRequested } : questionsRequested,
        },
    });

    return { allowed: true, remaining: limit - currentCount - questionsRequested };
};

// ─── Check (and consume) mock start ──────────────────────────────────────────
// Returns { allowed: boolean, reason?: string }
export const checkAndConsumeMock = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            isPremium: true,
            subscriptionStatus: true,
            trialEndsAt: true,
            exams: { select: { createdAt: true }, orderBy: { createdAt: 'desc' } },
        }
    });

    if (!user) return { allowed: false, reason: 'USER_NOT_FOUND' };

    const plan = getUserPlan(user);

    if (plan === 'EXPIRED') return { allowed: false, reason: 'TRIAL_EXPIRED' };
    if (plan === 'PREMIUM') return { allowed: true };

    if (plan === 'TRIAL') {
        const weekAgo = startOfWeekMs();
        const mockThisWeek = user.exams.some(e => new Date(e.createdAt).getTime() >= weekAgo);
        if (mockThisWeek) return { allowed: false, reason: 'WEEKLY_MOCK_LIMIT_REACHED' };
        return { allowed: true };
    }

    if (plan === 'MOCK_ONLY') {
        const monthStart = startOfMonthMs();
        const mockThisMonth = user.exams.some(e => new Date(e.createdAt).getTime() >= monthStart);
        if (mockThisMonth) return { allowed: false, reason: 'MONTHLY_MOCK_LIMIT_REACHED' };
        return { allowed: true };
    }

    return { allowed: false, reason: 'UNKNOWN_PLAN' };
};
