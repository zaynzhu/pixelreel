import { useState } from 'react';
import { apiFetch } from '../api';

type SyncTarget = 'douban-json' | 'douban-incremental' | 'douban-full' | 'trakt-movies' | 'trakt-shows' | 'posters' | null;

export default function RightActionDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [syncing, setSyncing] = useState<SyncTarget>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  return (
    <>
      <div
        className={`fixed top-[10%] right-0 z-50 flex transition-transform duration-300 ease-[cubic-bezier(.25,.46,.45,.94)] ${
          isOpen ? 'translate-x-0' : 'translate-x-[300px]'
        }`}
      >
        {/* 把手 (Handle) */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex h-24 w-10 flex-col items-center justify-center border-y border-l border-[var(--line)] bg-[var(--surface)] text-white hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] focus:outline-none"
          aria-label="Toggle Actions"
        >
          <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />

          <span className="writing-vertical-rl rotate-180 text-[10px] font-bold tracking-widest text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors">
            {isOpen ? 'CLOSE' : 'CMD_CTR'}
          </span>
        </button>

        {/* 面板内容 */}
        <div className="w-[300px] border-y border-l border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-md flex flex-col gap-8 max-h-[80vh] overflow-y-auto custom-scrollbar relative">
          <div className="absolute inset-y-0 right-0 w-1 bg-[radial-gradient(circle_at_center,_rgba(212,255,0,0.3),_transparent_70%)]" />

          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 ${syncing ? 'bg-[var(--accent-deep)] animate-pulse' : 'bg-[var(--accent)] animate-pulse'}`} />
              <span className="section-kicker !mb-0">SYS.OP</span>
            </div>
            <h3 className="font-display text-2xl text-white">COMMAND<br/>CENTER</h3>
          </div>

          {/* 状态消息 */}
          {statusMsg && (
            <div className="border-l-2 border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest">
              {statusMsg}
            </div>
          )}

          {/* 01: 豆瓣 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">01 //</span>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">豆瓣</span>
            </div>
            <ActionButton
              label="导入已有数据"
              onClick={() => handleDoubanImport('json', 'douban-json')}
              disabled={!!syncing}
              active={syncing === 'douban-json'}
            />
            <ActionButton
              label="增量数据导入"
              onClick={() => handleDoubanImport('incremental', 'douban-incremental')}
              disabled={!!syncing}
              active={syncing === 'douban-incremental'}
            />
            <ActionButton
              label="全量数据同步"
              onClick={() => handleDoubanImport('full', 'douban-full')}
              disabled={!!syncing}
              active={syncing === 'douban-full'}
            />
          </div>

          {/* 02: Trakt 同步 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">02 //</span>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Trakt</span>
            </div>
            <ActionButton
              label="拉取 Trakt 电影"
              onClick={() => handleTraktSync('movies')}
              disabled={!!syncing}
              active={syncing === 'trakt-movies'}
            />
            <ActionButton
              label="拉取 Trakt 剧集"
              onClick={() => handleTraktSync('shows')}
              disabled={!!syncing}
              active={syncing === 'trakt-shows'}
            />
          </div>

          {/* 03: 媒体库维护 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">03 //</span>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Library</span>
            </div>
            <ActionButton
              label="修复缺失海报"
              onClick={handleFillPosters}
              disabled={!!syncing}
              active={syncing === 'posters'}
            />
            <button className="border border-[var(--line)] bg-transparent text-[var(--muted)] hover:text-white hover:border-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all text-left flex justify-between">
              <span>批量编辑模式</span>
              <span>_ALT</span>
            </button>
          </div>

          {/* 底部：危险操作 */}
          <div className="mt-auto pt-6 border-t border-[var(--line)] flex flex-col gap-2">
            <button className="border border-red-900/50 bg-red-950/20 text-red-500 hover:bg-red-500 hover:text-black px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all flex justify-between items-center group">
              <span className="flex items-center gap-2">
                <svg className="w-3 h-3 group-hover:animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                清空系统缓存
              </span>
              <span className="opacity-0 transition-opacity group-hover:opacity-100">_DANGER</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  async function handleDoubanImport(mode: string, target: SyncTarget) {
    setSyncing(target);
    setStatusMsg('启动豆瓣导入...');
    try {
      const data = await apiFetch<{ taskId?: string }>(`/import/douban-harvest?mode=${mode}`, { method: 'POST' });
      if (!data.taskId) { setStatusMsg('启动失败'); setSyncing(null); return; }
      pollDoubanTask(data.taskId);
    } catch {
      setStatusMsg('请求失败');
      setSyncing(null);
    }
  }

  async function pollDoubanTask(taskId: string) {
    try {
      const data = await apiFetch<{
        status: string; error?: string;
        progress?: { processed?: number; total?: number; currentTitle?: string };
        result?: { imported: number; skipped: number };
      }>(`/import/douban-harvest/status?taskId=${taskId}`);
      if (data.status === 'completed') {
        const r = data.result!;
        setStatusMsg(`豆瓣: ${r.imported}导入, ${r.skipped}跳过`);
        setSyncing(null);
        return;
      }
      if (data.status === 'failed') {
        setStatusMsg(`豆瓣失败: ${data.error}`);
        setSyncing(null);
        return;
      }
      const p = data.progress!;
      setStatusMsg(`豆瓣 ${p.processed ?? '?'}/${p.total ?? '?'} ${p.currentTitle ?? ''}`);
      setTimeout(() => pollDoubanTask(taskId), 2000);
    } catch {
      setStatusMsg('查询失败');
      setSyncing(null);
    }
  }

  async function handleTraktSync(type: 'movies' | 'shows') {
    const key: SyncTarget = type === 'movies' ? 'trakt-movies' : 'trakt-shows';
    setSyncing(key);
    setStatusMsg(`Trakt ${type} 同步中...`);
    try {
      const res = await apiFetch<any>(`/trakt/import/${type}`, { method: 'POST' });
      setStatusMsg(`Trakt ${type}: 导入${res.imported ?? 0}, 跳过${res.skipped ?? 0}`);
    } catch (err: any) {
      setStatusMsg(`Trakt 失败: ${err.message}`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleFillPosters() {
    setSyncing('posters');
    setStatusMsg('修复海报中...');
    try {
      const res = await apiFetch<any>('/import/tmdb-covers/fill', { method: 'POST' });
      setStatusMsg(`海报: 修复${res.imported ?? 0}, 跳过${res.skipped ?? 0}`);
    } catch (err: any) {
      setStatusMsg(`修复失败: ${err.message}`);
    } finally {
      setSyncing(null);
    }
  }
}

function ActionButton({ label, onClick, disabled, active }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`brutal-btn flex items-center justify-between group ${active ? 'brutal-btn-accent' : ''}`}
    >
      <span className="flex items-center gap-2">
        <span className="text-[10px] opacity-50">[{'>'}]</span>
        {label}
      </span>
      <span className="opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-black">
        {active ? '...' : '_EXEC'}
      </span>
    </button>
  );
}