import { create } from "zustand"

interface AuthState {
  token: string | null
  authRequired: boolean
  initialized: boolean
  isLoggedIn: boolean
  initialize: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const storedToken = localStorage.getItem("pixelreel_token")

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  authRequired: true,
  initialized: false,
  isLoggedIn: Boolean(storedToken),

  initialize: async () => {
    try {
      const response = await fetch("/api/auth/status")
      if (!response.ok) throw new Error(`认证状态请求失败 (${response.status})`)

      const data = await response.json() as { enabled: boolean }
      const token = localStorage.getItem("pixelreel_token")
      set({
        token,
        authRequired: data.enabled,
        initialized: true,
        isLoggedIn: !data.enabled || Boolean(token),
      })
    } catch {
      const token = localStorage.getItem("pixelreel_token")
      set({
        token,
        authRequired: true,
        initialized: true,
        isLoggedIn: Boolean(token),
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
