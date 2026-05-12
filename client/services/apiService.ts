const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const getHeaders = () => {
    const token = localStorage.getItem('studr_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

export const apiRequest = async (endpoint: string, method: string = 'GET', body?: any) => {
    // Remove qualquer prefixo duplo '/api'
    const cleanEndpoint = endpoint.replace(/^\/?api/, '').replace(/^\/+/, '/');
    const baseUrlClean = API_URL.replace(/\/+$/, '');
    const url = `${baseUrlClean}${cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`}`;

    const response = await fetch(url, {
        method,
        headers: getHeaders(),
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 401) {
            console.warn('[API] 401 - Sessão expirada:', errorData.error, '| endpoint:', url);
            window.dispatchEvent(new CustomEvent('studr:session-expired', {
                detail: { reason: errorData.error || 'Sessão expirada', endpoint: url }
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