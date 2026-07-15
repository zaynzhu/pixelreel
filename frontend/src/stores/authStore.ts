import { create } from "zustand"

interface AuthState {
  token: string | null
  authRequired: boolean
  initialized: boolean
  initializationError: string | null
  isLoggedIn: boolean
  initialize: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const storedToken = localStorage.getItem("pixelreel_token")
let latestInitializationRequest = 0

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
      if (!response.ok) throw new Error(`认证状态请求失败 (${response.status})`)

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
        initializationError: reason instanceof Error ? reason.message : "认证状态请求失败",
      })
    }
  },

  login: async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) return false

      const data = await response.json()
      localStorage.setItem("pixelreel_token", data.token)
      set({ token: data.token, isLoggedIn: true })
      return true
    } catch {
      return false
    }
  },

  logout: () => {
    localStorage.removeItem("pixelreel_token")
    set((state) => ({
      token: null,
      isLoggedIn: !state.authRequired,
    }))
  },
}))
