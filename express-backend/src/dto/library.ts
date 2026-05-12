// Library 记录响应：与 Java 端 LibraryRecordResponse record 完全对齐
export interface LibraryRecordResponse {
  id: number;
  category: 'movie' | 'game' | 'tv_show';
  title: string;
  posterUrl: string | null;
  sourceKey: string | null;
  sourceLabel: string | null;
  platformLabel: string | null;
  status: string;
  rating: number | null;
  shortReview: string | null;
  playtimeMinutes: number | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
  createdAt: string;
  updatedAt: string;
  importedAt: string | null;
}

// Library 记录更新请求：与 Java 端 LibraryRecordUpdateRequest record 对齐
export interface LibraryRecordUpdateRequest {
  status: string;
  rating?: number | null;
  shortReview?: string | null;
}