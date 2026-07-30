export const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * 提前刷新的余量：access token 过期前 60s 触发刷新。
 * 注意：后端的 /api/auth/refresh 在 auth middleware 之后，
 * 必须携带「仍然有效」的 access token，因此无感刷新以「到期前主动刷新」为主，
 * 401 后补救式刷新仅作为兜底。
 */
const REFRESH_MARGIN_MS = 60_000;

const STORAGE_KEYS = {
  accessToken: "axon.access_token",
  refreshToken: "axon.refresh_token",
  accessTokenExpiresAt: "axon.access_token_expires_at",
  refreshTokenExpiresAt: "axon.refresh_token_expires_at",
} as const;

/** 与后端 ApiResponse 包裹结构对应 */
interface ApiEnvelope<T> {
  code: number;
  message?: string;
  data?: T;
}

/** 与 Rust AuthLoginResponse / AuthRefreshResponse (camelCase) 对应 */
export interface AuthTokens {
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  /** 秒 */
  accessTokenExpiresIn: number;
  /** 秒 */
  refreshTokenExpiresIn: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(message: string, status: number, code: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Token 存储                                                           */
/* ------------------------------------------------------------------ */

function saveTokens(tokens: AuthTokens): void {
  const now = Date.now();
  localStorage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
  localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
  localStorage.setItem(
    STORAGE_KEYS.accessTokenExpiresAt,
    String(now + tokens.accessTokenExpiresIn * 1000),
  );
  localStorage.setItem(
    STORAGE_KEYS.refreshTokenExpiresAt,
    String(now + tokens.refreshTokenExpiresIn * 1000),
  );
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.accessTokenExpiresAt);
  localStorage.removeItem(STORAGE_KEYS.refreshTokenExpiresAt);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.accessToken);
}

function getAccessTokenExpiresAt(): number {
  return Number(localStorage.getItem(STORAGE_KEYS.accessTokenExpiresAt) ?? 0);
}

function getRefreshTokenExpiresAt(): number {
  return Number(localStorage.getItem(STORAGE_KEYS.refreshTokenExpiresAt) ?? 0);
}

export function isAuthenticated(): boolean {
  return (
    getAccessToken() !== null && getRefreshTokenExpiresAt() > Date.now()
  );
}

/* ------------------------------------------------------------------ */
/* 会话过期通知（用于跳转登录页）                                          */
/* ------------------------------------------------------------------ */

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function emitSessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => listener());
}

/* ------------------------------------------------------------------ */
/* 无感刷新：单飞（single-flight）+ 到期前定时刷新                          */
/* ------------------------------------------------------------------ */

let refreshInFlight: Promise<boolean> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  const accessToken = getAccessToken();

  if (!refreshToken || getRefreshTokenExpiresAt() <= Date.now()) {
    return false;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 刷新接口受 auth middleware 保护，必须带当前 access token
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      // 后端 Deserialize 未改命名策略，这里是 snake_case
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      return false;
    }

    const envelope = (await res.json()) as ApiEnvelope<AuthTokens>;
    if (envelope.code !== 200 || !envelope.data) {
      return false;
    }

    saveTokens(envelope.data);
    return true;
  } catch {
    return false;
  }
}

/** 并发安全：同一时间只会有一个刷新请求 */
function refreshTokens(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function cancelScheduledRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * 安排下一次主动刷新：在 access token 过期前 REFRESH_MARGIN_MS 触发。
 * 刷新成功后递归安排下一轮，实现全程无感。
 */
function scheduleRefresh(): void {
  cancelScheduledRefresh();

  if (!isAuthenticated()) {
    return;
  }

  const delay = Math.max(
    0,
    getAccessTokenExpiresAt() - REFRESH_MARGIN_MS - Date.now(),
  );

  refreshTimer = setTimeout(() => {
    void refreshTokens().then((ok) => {
      if (ok) {
        scheduleRefresh();
      } else {
        clearTokens();
        emitSessionExpired();
      }
    });
  }, delay);
}

/**
 * 若 token 即将过期则先刷新，保证后续请求带的 token 有效。
 * 供请求拦截前置调用；二进制下载等绕过 request() 的场景也需自行调用。
 */
export async function ensureFreshToken(): Promise<void> {
  if (
    getAccessToken() !== null &&
    getAccessTokenExpiresAt() - REFRESH_MARGIN_MS <= Date.now()
  ) {
    const ok = await refreshTokens();
    if (ok) {
      scheduleRefresh();
    } else {
      clearTokens();
      emitSessionExpired();
    }
  }
}

/* ------------------------------------------------------------------ */
/* 请求核心                                                              */
/* ------------------------------------------------------------------ */

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** 请求体，自动序列化为 JSON */
  body?: unknown;
  /** 是否跳过鉴权（如登录接口）。默认 false */
  skipAuth?: boolean;
}

async function rawRequest<T>(
  path: string,
  options: RequestOptions,
): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;

  // FormData / Blob / ArrayBuffer / TypedArray 原样发送，不做 JSON 序列化；
  // 这些原始体的 Content-Type 交由浏览器决定（FormData 自动带 boundary）
  const isRawBody =
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body);

  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string> | undefined),
  };
  if (body !== undefined && !isRawBody) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body:
      body === undefined
        ? undefined
        : isRawBody
          ? (body as BodyInit)
          : JSON.stringify(body),
  });

  const envelope = (await res
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !envelope || envelope.code !== 200) {
    throw new ApiError(
      envelope?.message ?? `Request failed with status ${res.status}`,
      res.status,
      envelope?.code ?? res.status,
    );
  }

  return envelope.data as T;
}

/**
 * 业务请求入口：自动带 token、到期前主动刷新、401 兜底刷新并重试一次。
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!options.skipAuth) {
    await ensureFreshToken();
  }

  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    // 兜底：意外 401（如时钟偏移）时尝试刷新并重放一次
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      !options.skipAuth
    ) {
      const ok = await refreshTokens();
      if (ok) {
        scheduleRefresh();
        return await rawRequest<T>(path, options);
      }
      clearTokens();
      emitSessionExpired();
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Auth API                                                             */
/* ------------------------------------------------------------------ */

export async function login(
  username: string,
  password: string,
): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>("/api/auth/login", {
    method: "POST",
    body: { username, password },
    skipAuth: true,
  });
  saveTokens(tokens);
  scheduleRefresh();
  return tokens;
}

export async function register(
  username: string,
  password: string,
): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>("/api/auth/register", {
    method: "POST",
    body: { username, password },
    skipAuth: true,
  });
  saveTokens(tokens);
  scheduleRefresh();
  return tokens;
}

export function logout(): void {
  cancelScheduledRefresh();
  clearTokens();
}

/** 页面刷新后调用一次，恢复定时刷新 */
export function initAuth(): void {
  scheduleRefresh();
}

// 多标签页同步：其他标签页登录/登出/刷新后同步定时器
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEYS.accessToken) {
    if (event.newValue === null) {
      cancelScheduledRefresh();
    } else {
      scheduleRefresh();
    }
  }
});

/* ------------------------------------------------------------------ */
/* 便捷方法                                                              */
/* ------------------------------------------------------------------ */

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
