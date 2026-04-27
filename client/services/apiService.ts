
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const getHeaders = () => {
    const token = localStorage.getItem('studr_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

export const apiRequest = async (endpoint: string, method: string = 'GET', body?: any) => {
    const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: getHeaders(),
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Session expired or invalidated: dispatch event so App.tsx can show a graceful modal
        if (response.status === 401) {
            console.warn('[API] 401 - Sessão expirada:', errorData.error, '| endpoint:', endpoint);
            window.dispatchEvent(new CustomEvent('studr:session-expired', {
                detail: { reason: errorData.error || 'Sessão expirada', endpoint }
            }));
            const err = new Error('SESSION_EXPIRED');
            (err as any).status = 401;
            throw err;
        }

        const error = new Error(errorData.error || `API Request failed with status ${response.status}`);
        (error as any).status = response.status;
        throw error;
    }

    return response.json();
};
