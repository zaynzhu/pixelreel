import { create } from "zustand"
import { getApiErrorMessage } from "../api"
import { useI18nStore } from "./i18nStore"

interface LoginResult {
  success: boolean
  error: string | null
}

interface AuthState {
  token: string | null
  authRequired: boolean
  initialized: boolean
  initializationError: string | null
  isLoggedIn: boolean
  initialize: () => Promise<void>
  login: (username: string, password: string) => Promise<LoginResult>
  logout: () => void
}

const storedToken = localStorage.getItem("pixelreel_token")
let latestInitializationRequest = 0
let latestLoginRequest = 0

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  authRequired: true,
  initialized: false,
  initializationError: null,
  isLoggedIn: Boolean(storedToken),

  initialize: async () => {
    const requestId = ++latestInitializationRequest
    set({ initialized: false, initializationError: null })
    try {
      const response = await fetch("/api/auth/status")
      if (!response.ok) {
        throw new Error(useI18nStore.getState().t("auth.status_failed", response.status))
      }

      const data = await response.json() as { enabled: boolean }
      if (requestId !== latestInitializationRequest) return
      const token = localStorage.getItem("pixelreel_token")
      set({
        token,
        authRequired: data.enabled,
        initialized: true,
        initializationError: null,
        isLoggedIn: !data.enabled || Boolean(token),
      })
    } catch (reason) {
      if (requestId !== latestInitializationRequest) return
      set({
        initialized: true,
        initializationError: reason instanceof Error
          ? reason.message
          : useI18nStore.getState().t("auth.unavailable_title"),
      })
    }
  },

  login: async (username: string, password: string) => {
    const requestId = ++latestLoginRequest
    let response: Response
    try {
      response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
    } catch {
      return { success: false, error: useI18nStore.getState().t("login.err_unavailable") }
    }

    if (requestId !== latestLoginRequest) return { success: false, error: null }
    if (!response.ok) {
      return { success: false, error: await getApiErrorMessage(response) }
    }

    const data: unknown = await response.json().catch(() => null)
    if (!data || typeof data !== "object" || !("token" in data) || typeof data.token !== "string") {
      return { success: false, error: useI18nStore.getState().t("login.err_response") }
    }
    if (requestId !== latestLoginRequest) return { success: false, error: null }

    localStorage.setItem("pixelreel_token", data.token)
    set({ token: data.token, isLoggedIn: true })
    return { success: true, error: null }
  },

  logout: () => {
    latestLoginRequest++
    localStorage.removeItem("pixelreel_token")
    set((state) => ({
      token: null,
      isLoggedIn: !state.authRequired,
    }))
  },
}))
