# 进度显示修复 + Toast 组件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复爬取阶段进度显示卡在 0/0 的问题，并用统一的 Toast 组件替换浏览器原生 alert/confirm 弹窗。

**Architecture:** 后端在爬取阶段的 `onProgress` 回调中把 `processed` 设为已爬条数、`total` 设为 0（未知），前端根据 `total === 0` 显示纯文本进度。新增 Zustand toast store + Toast/ConfirmDialog 组件，挂载到 AppShell，替换所有 `alert()`/`confirm()` 调用。

**Tech Stack:** React 18, Zustand, TailwindCSS, CSS custom properties (--accent, --accent-deep, --surface, --line)

---

## 已完成的工作（不需要再做）

以下变更已经在代码库中完成，直接跳过：

1. **后端 task-manager 统一** — 豆瓣任务已从专用 task-manager 迁移到通用 task-manager，TaskPanel 可以看到任务了
2. **前端 apiFetch .json() 修复** — 去掉了多余的 `.json()` 调用
3. **按钮名称更新** — "全量导入数据"→"导入已有数据"、"增量导入豆瓣数据"→"增量数据导入"、"豆瓣数据同步"→"全量数据同步"
4. **scraper.ts 添加 ScrapeProgressCallback 类型和 onProgress 参数**
5. **import-service.ts 全量模式重置进度** — `progress.collectStart = 0; progress.collectDone = false`
6. **scraper.ts 返回 error 字段** — `{ ok, newItems, error }` 不再统一报"爬取被风控中止"
7. **import-service.ts 传递真实错误信息** — `failTask(task.taskId, collectResult.error || '爬取失败')`
8. **全量模式 onProgress 回调** — 已改为 `{ processed: info.total, total: 0, currentTitle: info.label }`（仅全量模式已改，增量模式还没改）

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `express-backend/src/services/douban-harvester/import-service.ts` | 爬取/导入任务调度 | 修改：增量模式的 onProgress 回调 |
| `frontend/src/stores/toastStore.ts` | Toast 状态管理 | 新建 |
| `frontend/src/components/Toast.tsx` | Toast 容器 + ConfirmDialog | 新建 |
| `frontend/src/components/AppShell.tsx` | 全局布局 | 修改：挂载 ToastContainer |
| `frontend/src/components/TaskPanel.tsx` | 任务面板 | 修改：替换 alert/confirm，修复进度显示 |
| `frontend/src/components/RightActionDrawer.tsx` | 命令面板 | 修改：进度显示逻辑，toast 替换 |

---

### Task 1: 修复增量模式 onProgress 回调

**Files:**
- Modify: `express-backend/src/services/douban-harvester/import-service.ts:290`

- [ ] **Step 1: 修改增量模式 onProgress 回调**

当前代码（约第290行）：
```typescript
updateProgress(task.taskId, { processed: 0, total: info.total, currentTitle: info.label });
```

改为：
```typescript
updateProgress(task.taskId, { processed: info.total, total: 0, currentTitle: info.label });
```

这与全量模式保持一致：爬取阶段 `processed` = 已爬条数，`total` = 0（未知总数）。

- [ ] **Step 2: 类型检查**

```bash
cd express-backend && npx tsc --noEmit
```

预期：无错误。

---

### Task 2: 创建 Toast Store

**Files:**
- Create: `frontend/src/stores/toastStore.ts`

- [ ] **Step 1: 创建 toastStore.ts**

```typescript
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = `toast-${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// 便捷方法：供非 React 代码调用
export function toast(message: string, type: ToastType = 'success') {
  useToastStore.getState().addToast(message, type);
}
```

- [ ] **Step 2: 验证 TypeScript 无报错**

```bash
cd frontend && npx tsc --noEmit
```

---

### Task 3: 创建 Toast + ConfirmDialog 组件

**Files:**
- Create: `frontend/src/components/Toast.tsx`

- [ ] **Step 1: 创建 Toast.tsx**

组件包含三部分：
1. `ToastContainer` — 固定在右上角，渲染 toast 列表
2. `ToastItem` — 单个 toast 通知，带滑入动画和自动消失
3. `ConfirmDialog` — 模态确认框，返回 `Promise<boolean>`

```tsx
import { useToastStore, type ToastType } from '../stores/toastStore';
import { useEffect, useState, useCallback } from 'react';

// ── Toast 容器 ──

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} message={t.message} type={t.type} onDismiss={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ id, message, type, onDismiss }: {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
}) {
  const borderColor = type === 'error' ? 'border-[var(--accent-deep)]' : type === 'warning' ? 'border-yellow-500' : 'border-[var(--accent)]';
  const textColor = type === 'error' ? 'text-[var(--accent-deep)]' : type === 'warning' ? 'text-yellow-400' : 'text-[var(--accent)]';

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 border-l-4 ${borderColor} bg-[var(--surface)] px-4 py-2 shadow-[0_0_20px_rgba(0,0,0,0.6)] animate-[slideIn_0.3s_ease-out] min-w-[240px] max-w-[360px]`}
    >
      <span className={`text-xs font-bold uppercase tracking-wider ${textColor}`}>
        {type === 'error' ? '[ERR]' : type === 'warning' ? '[WARN]' : '[OK]'}
      </span>
      <span className="text-xs text-[var(--ink)] flex-1">{message}</span>
      <button onClick={() => onDismiss(id)} className="text-[var(--muted)] hover:text-white text-xs ml-2">✕</button>
    </div>
  );
}

// ── ConfirmDialog ──

let confirmResolve: ((value: boolean) => void) | null = null;
let confirmState = { open: false, message: '', danger: false };

// React state bridge
export function useConfirmDialog() {
  const [state, setState] = useState(confirmState);

  useEffect(() => {
    const handler = (value: boolean) => {
      if (confirmResolve) confirmResolve(value);
      setState({ open: false, message: '', danger: false });
      confirmResolve = null;
    };
    // Store handler reference for the ConfirmDialog component
    (window as any).__confirmHandler = handler;
  }, []);

  // Sync external state changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (confirmState.open !== state.open || confirmState.message !== state.message) {
        setState({ ...confirmState });
      }
    }, 50);
    return () => clearInterval(interval);
  }, [state]);

  return state;
}

export function confirmDialog(message: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmState = { open: true, message, danger };
  });
}

export function ConfirmDialog() {
  const state = useConfirmDialog();

  if (!state.open) return null;

  const borderColor = state.danger ? 'border-[var(--accent-deep)]' : 'border-[var(--accent)]';
  const btnClass = state.danger
    ? 'border border-red-500/50 bg-red-950/30 text-red-400 hover:bg-red-500 hover:text-black'
    : 'border border-[var(--line)] bg-[var(--surface-hover)] text-white hover:bg-white hover:text-black';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => (window as any).__confirmHandler?.(false)}>
      <div className={`border ${borderColor} bg-[var(--surface)] p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] max-w-sm w-full`} onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-[var(--ink)] mb-6">{state.message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => (window as any).__confirmHandler?.(false)} className="text-xs uppercase tracking-widest text-[var(--muted)] hover:text-white px-4 py-2 transition-colors">
            取消
          </button>
          <button onClick={() => (window as any).__confirmHandler?.(true)} className={`${btnClass} px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all`}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 添加 slideIn 动画到 styles.css**

在 `frontend/src/styles.css` 的 `@layer components` 之前添加：

```css
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

---

### Task 4: 挂载 ToastContainer 和 ConfirmDialog

**Files:**
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: 在 AppShell 中导入并挂载**

在 AppShell.tsx 顶部添加导入：
```typescript
import { ToastContainer, ConfirmDialog } from './Toast';
```

在 `</div>` 标签（最外层容器）闭合之前，`<RightActionDrawer />` 之后添加：
```tsx
<ToastContainer />
<ConfirmDialog />
```

最终 AppShell 的 return 末尾变为：
```tsx
<RightActionDrawer />
<TaskPanel open={taskPanelOpen} onClose={() => setTaskPanelOpen(false)} />
<ToastContainer />
<ConfirmDialog />
```

---

### Task 5: 替换 TaskPanel 中的 alert/confirm

**Files:**
- Modify: `frontend/src/components/TaskPanel.tsx`

- [ ] **Step 1: 添加导入**

在文件顶部添加：
```typescript
import { confirmDialog } from './Toast';
import { toast } from '../stores/toastStore';
```

- [ ] **Step 2: 替换清空豆瓣数据的按钮 onClick**

当前代码（约第151-166行）：
```tsx
<button
  onClick={async () => {
    if (!confirm('确定要清空所有豆瓣来源的数据吗？此操作不可恢复。')) return;
    try {
      const result = await useTaskStore.getState().clearDoubanData();
      alert(`已删除 ${result.deletedMovies} 部电影, ${result.deletedTvShows} 部剧集`);
      await useTaskStore.getState().pollTasks();
    } catch (e: any) {
      alert(`清空失败: ${e.message}`);
    }
  }}
```

替换为：
```tsx
<button
  onClick={async () => {
    if (!(await confirmDialog('确定要清空所有豆瓣来源的数据吗？此操作不可恢复。', true))) return;
    try {
      const result = await useTaskStore.getState().clearDoubanData();
      toast(`已删除 ${result.deletedMovies} 部电影, ${result.deletedTvShows} 部剧集`);
      await useTaskStore.getState().pollTasks();
    } catch (e: any) {
      toast(`清空失败: ${e.message}`, 'error');
    }
  }}
```

- [ ] **Step 3: 修复 TaskCard 中的进度显示**

当前进度显示代码（约第125-129行）：
```tsx
<div className="flex justify-between mt-1">
  <span className="text-[10px] text-[var(--muted)]">
    {task.progress.processed}/{task.progress.total}
  </span>
  <span className="text-[10px] text-[var(--muted)] truncate max-w-[180px] ml-2">
    {task.progress.currentTitle}
  </span>
</div>
```

替换为：
```tsx
<div className="flex justify-between mt-1">
  <span className="text-[10px] text-[var(--muted)]">
    {task.progress.total > 0
      ? `${task.progress.processed}/${task.progress.total}`
      : task.progress.processed > 0
        ? `${task.progress.processed}条`
        : ''}
  </span>
  <span className="text-[10px] text-[var(--muted)] truncate max-w-[180px] ml-2">
    {task.progress.currentTitle}
  </span>
</div>
```

逻辑：
- `total > 0`：显示 `processed/total`（导入阶段）
- `total === 0 && processed > 0`：显示 `N条`（爬取阶段）
- `total === 0 && processed === 0`：不显示数字（启动阶段）

---

### Task 6: 修复 RightActionDrawer 进度显示 + 错误 toast

**Files:**
- Modify: `frontend/src/components/RightActionDrawer.tsx`

- [ ] **Step 1: 添加 toast 导入**

在文件顶部 `import { apiFetch } from '../api';` 后添加：
```typescript
import { toast } from '../stores/toastStore';
```

- [ ] **Step 2: 修复 pollDoubanTask 的进度显示**

当前代码（约第162行）：
```typescript
const p = data.progress!;
setStatusMsg(`豆瓣 ${p.processed ?? '?'}/${p.total ?? '?'} ${p.currentTitle ?? ''}`);
```

替换为：
```typescript
const p = data.progress!;
const progressText = p.total && p.total > 0
  ? `${p.processed ?? 0}/${p.total}`
  : p.processed && p.processed > 0
    ? `${p.processed}条`
    : '';
setStatusMsg(`豆瓣 ${progressText} ${p.currentTitle ?? ''}`.trim());
```

- [ ] **Step 3: 替换错误处理为 toast**

在 `handleDoubanImport` 中（约第138-141行）：
```typescript
} catch {
  setStatusMsg('请求失败');
  setSyncing(null);
}
```

替换为：
```typescript
} catch {
  toast('请求失败', 'error');
  setSyncing(null);
}
```

在 `pollDoubanTask` 中（约第157-159行）：
```typescript
if (data.status === 'failed') {
  setStatusMsg(`豆瓣失败: ${data.error}`);
  setSyncing(null);
  return;
}
```

替换为：
```typescript
if (data.status === 'failed') {
  toast(`豆瓣失败: ${data.error}`, 'error');
  setSyncing(null);
  return;
}
```

在 `pollDoubanTask` 的 catch 中（约第165-168行）：
```typescript
} catch {
  setStatusMsg('查询失败');
  setSyncing(null);
}
```

替换为：
```typescript
} catch {
  toast('查询失败', 'error');
  setSyncing(null);
}
```

在 `handleTraktSync` 中（约第178-179行）：
```typescript
} catch (err: any) {
  setStatusMsg(`Trakt 失败: ${err.message}`);
}
```

替换为：
```typescript
} catch (err: any) {
  toast(`Trakt 失败: ${err.message}`, 'error');
}
```

在 `handleFillPosters` 中（约第192-193行）：
```typescript
} catch (err: any) {
  setStatusMsg(`修复失败: ${err.message}`);
}
```

替换为：
```typescript
} catch (err: any) {
  toast(`修复失败: ${err.message}`, 'error');
}
```

注意：成功消息保留 `setStatusMsg`（面板内状态显示），只有错误和失败用 toast。`pollDoubanTask` 的 completed 分支也保留 `setStatusMsg`。

---

### Task 7: 验证

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd E:/gemini/antigravity/pixelreel/express-backend && npx tsc --noEmit
cd E:/gemini/antigravity/pixelreel/frontend && npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 2: 浏览器验证**

1. 打开 http://localhost:18888
2. 点击右侧 CMD_CTR 面板，点"导入已有数据"
3. 验证：进度消息应显示"豆瓣 20条 导入已有数据"或类似文本，不再显示"0/0"
4. 打开 TASKS 面板，验证任务卡片进度显示正确
5. 点击 TaskPanel 中失败/取消任务的"清空豆瓣数据"按钮
6. 验证：出现自定义确认对话框（非浏览器 confirm），点确认后出现 toast 通知
7. 验证 toast 3秒后自动消失，可手动关闭
8. 故意触发一个错误（如后端未启动时点按钮），验证出现红色错误 toast