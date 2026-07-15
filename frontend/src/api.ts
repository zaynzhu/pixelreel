// 统一 API 请求工具，自动附加 JWT Token
function getToken(): string | null {
  return localStorage.getItem("pixelreel_token");
}

const API_BASE = "/api";

export async function getApiErrorMessage(response: Response): Promise<string> {
  const fallback = `请求失败 (${response.status})`;
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
    throw new Error("登录已过期，请重新登录");
  }

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return undefined as unknown as T;
}
