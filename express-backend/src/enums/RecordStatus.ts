// 枚举：记录状态，与 Java 端 RecordStatus 完全对齐
// 注意：DROPPED 作为预留扩展状态，Java 端暂无但数据库中可能存在
export enum RecordStatus {
  UNSET = 'UNSET',
  WANT = 'WANT',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  DROPPED = 'DROPPED',
}

// 从字符串解析 RecordStatus，兼容大小写
// 对未知值做宽容处理：返回原始大写字符串，避免因数据库中存在额外状态而崩溃
export function parseRecordStatus(code: string): string {
  const upper = code.toUpperCase();
  const found = Object.values(RecordStatus).find((s) => s === upper);
  return found ?? upper;
}