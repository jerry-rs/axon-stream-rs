import { tokenStorage } from './token-storage';


const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "";


export interface ApiResponse<T = unknown> {
    code: number;
    message: string;
    data: T;
}

export class ApiError extends Error {
    code: number;
    constructor(code: number, message: string) {
        super(message);
        this.code = code;
        this.name = 'ApiError';
    }
}

export class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = 'HttpError';
    }
}


// ---- 刷新状态管理：防止并发重复刷新 ----
let isRefreshing = false;
let pendingQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: unknown) => void;
}> = [];

// ---- 主动刷新定时器：token 过期前自动续期 ----
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

// 手动退出时清理定时器
window.addEventListener('auth:logout', clearRefreshTimer);

// 页面从后台恢复时（如笔记本合盖后打开），检查 token 是否需要刷新
window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const token = tokenStorage.getAccessToken();
        if (token) {
            const exp = decodeExp(token);
            // 如果 token 将在 30 秒内过期或已经过期，立即刷新
            if (exp && exp - Date.now() < 30_000) {
                refreshAccessToken()
                    .then((t) => scheduleRefresh(t))
                    .catch((e) => {
                        console.warn('[TokenRefresh] visibility 恢复刷新失败:', e);
                    });
            }
        }
    }
});

function decodeExp(token: string): number | null {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

function clearRefreshTimer() {
    if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
}

function scheduleRefresh(accessToken: string) {
    clearRefreshTimer();
    const exp = decodeExp(accessToken);
    if (!exp) return;

    const delay = exp - Date.now() - 60_000; // 提前 1 分钟刷新
    if (delay <= 0) {
        // 即将或已经过期，立即刷新
        refreshAccessToken().then((t) => scheduleRefresh(t)).catch((e) => {
            console.warn('[TokenRefresh] 主动刷新失败:', e);
        });
        return;
    }

    refreshTimer = setTimeout(() => {
        refreshAccessToken()
            .then((t) => scheduleRefresh(t))
            .catch((e) => {
                console.warn('[TokenRefresh] 定时刷新失败:', e);
            });
    }, delay);
}

function resolveQueue(token: string) {
    pendingQueue.forEach(({ resolve }) => resolve(token));
    pendingQueue = [];
}

function rejectQueue(error: unknown) {
    pendingQueue.forEach(({ reject }) => reject(error));
    pendingQueue = [];
}

async function refreshAccessToken(): Promise<string> {
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token');

    // 直接用裸 fetch，不走 request()，避免死循环
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
        throw new HttpError(res.status, 'Refresh token failed');
    }

    const body: ApiResponse<{ accessToken: string; refreshToken: string }> = await res.json();
    if (body.code !== 200) {
        throw new ApiError(body.code, body.message);
    }

    const { accessToken, refreshToken: newRefreshToken } = body.data;
    tokenStorage.setTokens(accessToken, newRefreshToken);
    scheduleRefresh(accessToken);
    return accessToken;
}

// ---- 请求配置类型 ----
interface RequestOptions extends Omit<RequestInit, 'body'> {
    body?: unknown;              // 传对象即可，内部自动 JSON.stringify
    params?: Record<string, string | number | boolean | undefined>;
    skipAuth?: boolean;          // 不需要携带 token 的请求（如登录接口本身）
    _retry?: boolean;            // 内部标记，业务代码不要传
}

function buildUrl(path: string, params?: RequestOptions['params']) {
    const fullPath = path.startsWith('http') ? path : BASE_URL + path;

    // 按 / 拆分路径段，用 encodeURIComponent 逐一编码
    // 这样 # ? & 等特殊字符和中文字符都会被正确处理
    let encoded: string;
    if (fullPath.startsWith('http://') || fullPath.startsWith('https://')) {
        // 绝对 URL：保留协议和域名部分不动，只编码路径部分
        const protoEnd = fullPath.indexOf('://') + 3;
        const pathStart = fullPath.indexOf('/', protoEnd);
        if (pathStart === -1) {
            encoded = fullPath;
        } else {
            const origin = fullPath.slice(0, pathStart);
            const pathPart = fullPath.slice(pathStart);
            encoded = origin + pathPart.split('/').map(encodeURIComponent).join('/');
        }
    } else {
        encoded = fullPath.split('/').map(encodeURIComponent).join('/');
    }

    const url = new URL(encoded, BASE_URL || window.location.origin);
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) url.searchParams.append(key, String(value));
        });
    }
    return url.toString();
}

// ---- 核心请求函数 ----
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, params, skipAuth, headers, _retry, ...rest } = options;

    const accessToken = tokenStorage.getAccessToken();

    const finalHeaders: HeadersInit = {
        'Content-Type': 'application/json',
        ...(accessToken && !skipAuth ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
    };

    const res = await fetch(buildUrl(path, params), {
        ...rest,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // ---- 401 处理：排队 or 触发刷新 ----
    if (res.status === 401 && !skipAuth && !_retry) {
        if (isRefreshing) {
            // 排队等待刷新结果，拿到新 token 后重试原请求
            const newToken = await new Promise<string>((resolve, reject) => {
                pendingQueue.push({ resolve, reject });
            });
            return request<T>(path, {
                ...options,
                _retry: true,
                headers: { ...headers, Authorization: `Bearer ${newToken}` },
            });
        }

        isRefreshing = true;
        try {
            const newToken = await refreshAccessToken();
            resolveQueue(newToken);
            return request<T>(path, {
                ...options,
                _retry: true,
                headers: { ...headers, Authorization: `Bearer ${newToken}` },
            });
        } catch (refreshError) {
            console.warn('[TokenRefresh] 401 被动刷新失败:', refreshError);
            rejectQueue(refreshError);
            tokenStorage.clear();
            clearRefreshTimer();
            window.dispatchEvent(new CustomEvent('auth:logout'));
            throw refreshError;
        } finally {
            isRefreshing = false;
        }
    }

    // ---- 非 401 的 HTTP 错误（500、404 等） ----
    if (!res.ok) {
        // 尝试解析后端错误体，拿不到就用状态码兜底
        let message = res.statusText;
        try {
            const errBody: ApiResponse = await res.json();
            throw new ApiError(errBody.code, errBody.message);
        } catch {
            throw new HttpError(res.status, message);
        }
    }

    // ---- 204 No Content 之类，没有 body ----
    if (res.status === 204) {
        return undefined as T;
    }

    const body_: ApiResponse<T> = await res.json();

    // ---- 业务 code 判断 ----
    if (body_.code !== 200) {
        throw new ApiError(body_.code, body_.message);
    }
    return body_.data;
}

// ---- 对外暴露的方法（类似 axios 的语法糖） ----
export const apiClient = {
    get: <T>(path: string, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'GET' }),

    /** 下载文件，返回 { blob, filename } */
  download: async (path: string, options?: RequestOptions) => {
    const { body: _, ...rest } = (options ?? {});
        const res = await fetch(buildUrl(path, rest.params), {
            ...rest,
            method: 'GET',
            headers: {
                ...(tokenStorage.getAccessToken() && !rest.skipAuth
                    ? { Authorization: `Bearer ${tokenStorage.getAccessToken()}` }
                    : {}),
                ...rest.headers,
            },
        });

        if (!res.ok) {
            let message = res.statusText;
            try {
                const errBody: ApiResponse = await res.json();
                throw new ApiError(errBody.code, errBody.message);
            } catch (e) {
                if (e instanceof ApiError) throw e;
                throw new HttpError(res.status, message);
            }
        }

        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition');
        let filename = 'download';
        if (disposition) {
          // 1. 优先 filename*=UTF-8''xxx （RFC 5987/6266）
          let starParsed = false;
          const starMatch = disposition.match(/filename\*\s*=\s*([^;]+)/i);
          if (starMatch) {
            const raw = starMatch[1].trim().replace(/^["']|["']$/g, '');
            // 格式: <charset>'(<lang>')'value —— 找第二个单引号后的内容
            const firstQuote = raw.indexOf("'");
            if (firstQuote >= 0) {
              const secondQuote = raw.indexOf("'", firstQuote + 1);
              if (secondQuote >= 0) {
                const encoded = raw.slice(secondQuote + 1);
                try {
                  filename = decodeURIComponent(encoded);
                  starParsed = true;
                } catch {
                  filename = encoded;
                  starParsed = true;
                }
              }
            }
          }

          // 2. 回退 filename="xxx" 或 filename=xxx
          if (!starParsed) {
            const match = disposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;\n]+))/i);
            if (match) {
              filename = (match[1] ?? match[2] ?? '').trim();
            }
          }
        }
        return { blob, filename };
    },

    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'POST', body }),

    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'PUT', body }),

    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'PATCH', body }),

    delete: <T>(path: string, options?: RequestOptions) =>
        request<T>(path, { ...options, method: 'DELETE' }),
};

/** 应用初始化时调用，如果已有 token 则启动定时刷新 */
export function initTokenRefresh() {
    const token = tokenStorage.getAccessToken();
    if (token) {
        scheduleRefresh(token);
    }
}
