export interface ApiErrorDetail {
  field?: string;
  issue: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId: string;
  };
}

export class ApiClientError extends Error {
  code: string;
  details?: ApiErrorDetail[];
  requestId: string;
  status: number;

  constructor(status: number, errorData: ApiErrorResponse['error']) {
    super(errorData.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = errorData.code;
    this.details = errorData.details;
    this.requestId = errorData.requestId;
  }
}

const TOKEN_KEY = 'auth_token';

export const authStorage = {
  getToken: () => sessionStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clearToken: () => sessionStorage.removeItem(TOKEN_KEY),
};

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T; meta?: any }> {
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Prepend /api/v1 if not absolute or already starting with /api
  let url = endpoint;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (!url.startsWith('/api')) {
      url = `/api/v1${url.startsWith('/') ? '' : '/'}${url}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return { data: null as any };
  }

  const responseData = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      authStorage.clearToken();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?sessionEnded=true';
      }
    }

    const errorPayload = responseData?.error || {
      code: 'INTERNAL_ERROR',
      message: response.statusText || 'Request failed',
      requestId: response.headers.get('x-request-id') || 'unknown',
    };

    throw new ApiClientError(response.status, errorPayload);
  }

  return responseData;
}

