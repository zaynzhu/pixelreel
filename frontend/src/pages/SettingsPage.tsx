import { useState, useEffect, useCallback } from 'react';
import { useI18nStore } from '../stores/i18nStore';
import { apiFetch } from '../api';
import { toast } from '../stores/toastStore';
import type { SettingsCategory, SettingsResponse, SettingsSaveResponse } from '../types/settings';

export default function SettingsPage() {
  const { t } = useI18nStore();
  const [categories, setCategories] = useState<SettingsCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [restartRequired, setRestartRequired] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('general');

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiFetch<SettingsResponse>('/settings');
      setCategories(data.categories);
      const vals: Record<string, string> = {};
      for (const cat of data.categories) {
        for (const f of cat.fields) {
          vals[f.key] = f.value;
        }
      }
      setEditValues(vals);
      setOriginalValues(vals);
      setRevealedKeys(new Set());
      setRestartRequired(false);
    } catch {
      toast(t('settings.load_failed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const hasChanges = Object.keys(editValues).some(
    (k) => editValues[k] !== originalValues[k]
  );

  const handleChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggle = (key: string) => {
    setEditValues((prev) => ({
      ...prev,
      [key]: prev[key] === 'true' ? 'false' : 'true',
    }));
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const changedEntries = Object.entries(editValues).filter(
        ([k, v]) => v !== originalValues[k]
      );
      const values = Object.fromEntries(changedEntries);
      const data = await apiFetch<SettingsSaveResponse>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ values }),
      });
      if (data.success) {
        toast(t('settings.saved'));
        setRestartRequired(data.restartRequired);
        setOriginalValues({ ...editValues });
      }
    } catch (e: any) {
      toast(`${t('settings.save_failed')}: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-[var(--muted)] text-xs uppercase tracking-widest">
          LOADING...
        </div>
      </div>
    );
  }

  const activeCat = categories.find((c) => c.key === activeCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-[var(--line)] bg-[var(--surface)] p-6 relative">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[var(--accent)]" />
        <span className="section-kicker">{t('settings.kicker')}</span>
        <h1 className="text-2xl text-white font-display">{t('settings.title')}</h1>
        <p className="mt-2 text-xs text-[var(--muted)]">{t('settings.desc')}</p>
      </div>

      {/* Category tabs + content */}
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <div className="border border-[var(--line)] bg-[var(--surface)]">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`w-full text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b border-[var(--line)] last:border-b-0 ${
                  activeCategory === cat.key
                    ? 'bg-[var(--accent)] text-black'
                    : 'text-[var(--muted)] hover:text-white hover:bg-[var(--surface-hover)]'
                }`}
              >
                {t(`settings.cat.${cat.key}` as any)}
              </button>
            ))}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`w-full mt-4 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border ${
              !hasChanges || saving
                ? 'border-[var(--line)] text-[var(--muted)] cursor-not-allowed'
                : 'border-[var(--accent)] bg-[var(--accent)] text-black hover:bg-white'
            }`}
          >
            {saving ? t('settings.saving') : hasChanges ? t('settings.save') : t('settings.no_changes')}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeCat && (
            <div className="border border-[var(--line)] bg-[var(--surface)] p-6">
              <h2 className="text-sm font-bold text-white mb-4 font-display uppercase tracking-wider">
                {t(`settings.cat.${activeCat.key}` as any)}
              </h2>

              <div className="space-y-4">
                {activeCat.fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      {field.key}
                    </label>

                    {field.type === 'boolean' ? (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggle(field.key)}
                          className={`w-12 h-6 flex items-center transition-all duration-200 ${
                            editValues[field.key] === 'true'
                              ? 'bg-[var(--accent)] justify-end'
                              : 'bg-[var(--line)] justify-start'
                          }`}
                        >
                          <div className={`w-5 h-5 bg-white transition-transform ${
                            editValues[field.key] === 'true' ? '' : 'translate-x-0.5'
                          }`} />
                        </button>
                        <span className="text-xs text-[var(--ink)]">
                          {editValues[field.key] === 'true' ? 'TRUE' : 'FALSE'}
                        </span>
                        {editValues[field.key] !== originalValues[field.key] && (
                          <span className="text-[10px] text-[var(--accent)]">*</span>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type={field.sensitive && !revealedKeys.has(field.key) ? 'password' : 'text'}
                          value={editValues[field.key] ?? ''}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="tech-input w-full pr-16"
                        />
                        {field.sensitive && (
                          <button
                            onClick={() => toggleReveal(field.key)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                          >
                            {revealedKeys.has(field.key) ? t('settings.hide') : t('settings.reveal')}
                          </button>
                        )}
                        {editValues[field.key] !== originalValues[field.key] && (
                          <span className="absolute right-2 bottom-0 text-[10px] text-[var(--accent)]">
                            {field.sensitive ? '*' : 'MODIFIED'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Restart notice */}
      {restartRequired && (
        <div className="border border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-3 text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest">
          {t('settings.restart_required')}
        </div>
      )}
    </div>
  );
}