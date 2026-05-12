import { create } from "zustand";

interface AuthState {
  token: string | null;
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("pixelreel_token"),
  isLoggedIn: !!localStorage.getItem("pixelreel_token"),

  login: async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      localStorage.setItem("pixelreel_token", data.token);
      set({ token: data.token, isLoggedIn: true });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("pixelreel_token");
    set({ token: null, isLoggedIn: false });
  },
}));