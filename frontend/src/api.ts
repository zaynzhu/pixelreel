// 统一 API 请求工具，自动附加 JWT Token
import { useI18nStore } from "./stores/i18nStore";

function getToken(): string | null {
  return localStorage.getItem("pixelreel_token");
}

const API_BASE = "/api";

export async function getApiErrorMessage(response: Response): Promise<string> {
  const fallback = useI18nStore.getState().t("api.request_failed", response.status);
  const text = await response.text().catch(() => "");
  if (!text) return fallback;

  try {
    const payload: unknown = JSON.parse(text);
    if (payload && typeof payload === "object" && "error" in payload) {
      const error = (payload as { error?: unknown }).error;
      if (typeof error === "string" && error.trim()) return error;
    }
  } catch {
    // 非 JSON 响应保留原文
  }
  return text;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // 默认设置 Content-Type（如果没传 body 或 body 不是 FormData）
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // 401 时自动跳转登录页
  if (response.status === 401) {
    localStorage.removeItem("pixelreel_token");
    window.location.href = "/login";
    throw new Error(useI18nStore.getState().t("api.session_expired"));
  }

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return undefined as unknown as T;
}

export interface ApiDownloadMetadata {
  exportVersion: number | null
  recordCount: number | null
  platformProfileCount: number | null
  recordsSha256: string | null
}

function parseNonNegativeHeader(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export async function apiDownload(path: string): Promise<{
  blob: Blob
  filename: string | null
  metadata: ApiDownloadMetadata
}> {
  const token = getToken()
  const headers = new Headers()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const response = await fetch(`${API_BASE}${path}`, { headers })
  if (response.status === 401) {
    localStorage.removeItem("pixelreel_token")
    window.location.href = "/login"
    throw new Error(useI18nStore.getState().t("api.session_expired"))
  }
  if (!response.ok) throw new Error(await getApiErrorMessage(response))

  const disposition = response.headers.get("content-disposition") || ""
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? null
  const recordsSha256 = response.headers.get("x-pixelreel-records-sha256")
  return {
    blob: await response.blob(),
    filename,
    metadata: {
      exportVersion: parseNonNegativeHeader(response.headers.get("x-pixelreel-export-version")),
      recordCount: parseNonNegativeHeader(response.headers.get("x-pixelreel-record-count")),
      platformProfileCount: parseNonNegativeHeader(
        response.headers.get("x-pixelreel-platform-profile-count"),
      ),
      recordsSha256: recordsSha256 && /^[a-f0-9]{64}$/i.test(recordsSha256)
        ? recordsSha256.toLowerCase()
        : null,
    },
  }
}
