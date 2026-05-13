import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useI18nStore } from "../stores/i18nStore";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useI18nStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) {
      navigate("/", { replace: true });
    } else {
      setError(t("login.err_auth"));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--page-bg)" }}>
      <div className="absolute top-4 right-4">
        <button onClick={toggleLang} className="brutal-btn">
          {lang === "en" ? "中文" : "EN"}
        </button>
      </div>
      
      <div className="w-full max-w-md">
        <div className="dash-card">
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[var(--accent)]" />
          
          <div className="text-center">
            <span className="section-kicker animate-pulse">{t("login.sys_auth")}</span>
            <h1 className="font-display mt-2 text-3xl text-white sm:text-4xl hover-glitch">
              {t("login.title")}
            </h1>
            <p className="mt-4 text-[10px] uppercase tracking-widest leading-6 text-[var(--muted)]">
              {t("login.desc")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]"
              >
                {t("login.user_id")}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("login.user_placeholder")}
                autoComplete="username"
                required
                className="tech-input mt-2"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]"
              >
                {t("login.access_code")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
                required
                className="tech-input mt-2"
              />
            </div>

            {error && (
              <div className="mt-5 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-bold uppercase">
                [ERR] {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="brutal-btn-accent w-full mt-4"
            >
              {loading ? t("login.btn_verify") : t("login.btn_login")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}