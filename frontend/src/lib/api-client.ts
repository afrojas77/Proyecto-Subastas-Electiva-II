interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
const apiBaseUrl = configuredBaseUrl.replace(/\/$/, '');

export async function apiRequest<Response>(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let response: globalThis.Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No fue posible conectar con la API. Verifica que el servidor esté iniciado.',
    );
  }

  const body = (await response.json().catch(() => null)) as
    ApiErrorResponse | Response | null;

  if (!response.ok) {
    const errorBody = body as ApiErrorResponse | null;
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? 'REQUEST_FAILED',
      errorBody?.error?.message ?? 'La solicitud no pudo completarse.',
    );
  }

  return body as Response;
}
