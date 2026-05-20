// 向后兼容：douban-harvester 内部代码仍使用 createTask('full') 等，
// 但实际委托给泛化 task-manager，由 import-service.ts 传入 type 和 label。
export type TaskMode = 'json' | 'full' | 'incremental';
export type { TaskStatus, TaskProgress } from '../task-manager';
export type { Task as HarvestTask } from '../task-manager';
export { ImportSummary } from '../../dto/import-summary';

import { createTask as _create, getTask as _get, updateProgress as _update, completeTask as _complete, failTask as _fail } from '../task-manager';

const modeToLabel: Record<TaskMode, string> = {
  json: '豆瓣 JSON 导入',
  full: '豆瓣全量爬取',
  incremental: '豆瓣增量爬取',
};

export function createTask(mode: TaskMode) {
  return _create('douban-harvest', modeToLabel[mode]);
}

export const getTask = _get;
export const updateProgress = _update;
export const completeTask = _complete;
export const failTask = _fail;