// 导入结果摘要：与 Java 端 ImportSummary 完全对齐
export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}