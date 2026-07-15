const activeImportOperations = new Set<string>();

export class ImportOperationConflictError extends Error {
  readonly status = 409;

  constructor(label: string) {
    super(`${label} 正在执行，请稍后再试`);
    this.name = 'ImportOperationConflictError';
  }
}

export function acquireImportOperation(key: string, label: string): () => void {
  if (activeImportOperations.has(key)) throw new ImportOperationConflictError(label);
  activeImportOperations.add(key);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeImportOperations.delete(key);
  };
}

export async function runExclusiveImport<T>(
  key: string,
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  const release = acquireImportOperation(key, label);
  try {
    return await operation();
  } finally {
    release();
  }
}
