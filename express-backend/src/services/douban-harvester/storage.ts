import path from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import type { Progress, SyncState } from './types';
import { config } from '../../config';

const DATA_DIR = config.douban.dataDir;
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const SYNC_STATE_FILE = path.join(DATA_DIR, 'sync_state.json');

export function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    collectStart: 0,
    collectDone: false,
    reviewsPage: 1,
    reviewsDone: false,
  };
}

export function saveProgress(progress: Progress): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

export function loadData<T>(filename: string): T[] {
  const fullPath = path.isAbsolute(filename) ? filename : path.join(DATA_DIR, filename);
  if (existsSync(fullPath)) {
    return JSON.parse(readFileSync(fullPath, 'utf-8'));
  }
  return [];
}

export function saveData(filename: string, data: unknown): void {
  const fullPath = path.isAbsolute(filename) ? filename : path.join(DATA_DIR, filename);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadSyncState(): SyncState {
  if (existsSync(SYNC_STATE_FILE)) {
    return JSON.parse(readFileSync(SYNC_STATE_FILE, 'utf-8'));
  }
  return { lastSyncDate: null };
}

export function saveSyncState(dateStr: string): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SYNC_STATE_FILE, JSON.stringify({ lastSyncDate: dateStr }, null, 2), 'utf-8');
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dedupByLink<T extends { link: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

export function ensureOutputDir(): void {
  mkdirSync(path.join(DATA_DIR, '..', 'output'), { recursive: true });
  mkdirSync(DATA_DIR, { recursive: true });
}
