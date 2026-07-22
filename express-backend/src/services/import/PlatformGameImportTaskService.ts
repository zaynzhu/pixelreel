import type { ImportSummary } from '../../dto/import-summary';
import type { RecordStatus } from '../../enums/RecordStatus';
import {
  createTask,
  failTask,
  updateProgress,
} from '../task-manager';
import { settleImportSummaryTask } from './ImportSummaryTaskService';
import { importXboxOwnedGames } from './OpenXblImportService';
import { importPsnOwnedGames } from './PsnProfilesImportService';
import { importMicrosoftXboxGames } from '../xbox/MicrosoftXboxService';

type PlatformImporter = (
  accountId: string,
  status: RecordStatus | null,
  onProgress: (processed: number, total: number, currentTitle: string) => void,
  signal: AbortSignal,
) => Promise<ImportSummary>;

function startPlatformImportTask(
  type: string,
  label: string,
  accountId: string,
  status: RecordStatus | null,
  importer: PlatformImporter,
) {
  const task = createTask(type, label);
  void importer(
    accountId,
    status,
    (processed, total, currentTitle) => {
      updateProgress(task.taskId, { processed, total, currentTitle });
    },
    task.abortController.signal,
  ).then((result) => {
    settleImportSummaryTask(task.taskId, result);
  }).catch((error: unknown) => {
    failTask(task.taskId, error instanceof Error ? error.message : `${label}失败`);
  });
  return task;
}

export function startXboxOwnedImportTask(
  provider: 'openxbl' | 'microsoft',
  gamertag: string,
  status: RecordStatus | null,
) {
  return startPlatformImportTask(
    'xbox-owned',
    provider === 'microsoft' ? 'Xbox Microsoft 导入' : 'Xbox OpenXBL 导入',
    gamertag,
    status,
    provider === 'microsoft' ? importMicrosoftXboxGames : importXboxOwnedGames,
  );
}

export function startPsnOwnedImportTask(psnId: string, status: RecordStatus | null) {
  return startPlatformImportTask(
    'psn-owned',
    'PSN 导入',
    psnId,
    status,
    importPsnOwnedGames,
  );
}
