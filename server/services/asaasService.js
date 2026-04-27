import dotenv from 'dotenv';
dotenv.config();

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://www.asaas.com/api/v3';

const headers = {
    'access_token': ASAAS_API_KEY,
    'Content-Type': 'application/json',
};

export const asaasService = {
    // 1. Criar ou validar cliente
    async getOrCreateCustomer(user) {
        if (user.asaasCustomerId) return user.asaasCustomerId;

        try {
            const response = await fetch(`${ASAAS_API_URL}/customers`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: user.name || 'Estudante Studr',
                    email: user.email,
                    externalReference: user.id
                })
            });

            const data = await response.json();
            if (data.errors) throw new Error(data.errors[0].description);
            
            return data.id;
        } catch (error) {
            console.error('Erro Asaas (Customer):', error);
            throw error;
        }
    },

    // 2. Criar Checkout de Assinatura
    async createSubscription(customerId, planType) {
        const isAnnual = planType === 'annual';
        const value = isAnnual ? 564.00 : 59.00;
        const cycle = isAnnual ? 'YEARLY' : 'MONTHLY';

        try {
            const response = await fetch(`${ASAAS_API_URL}/subscriptions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    customer: customerId,
                    billingType: 'UNDEFINED',
                    value: value,
                    nextDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    cycle: cycle,
                    description: `Assinatura Studr - Plano ${isAnnual ? 'Anual' : 'Mensal'}`
                })
            });

            const data = await response.json();
            if (data.errors) throw new Error(data.errors[0].description);

            return {
                subscriptionId: data.id,
                invoiceUrl: data.invoiceUrl
            };
        } catch (error) {
            console.error('Erro Asaas (Subscription):', error);
            throw error;
        }
    }
};
