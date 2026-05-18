// 评分记录
export interface CollectItem {
  title: string;       // 中文片名（<em>内容）
  altTitle: string;    // 外文名（/后面的部分）
  intro: string;       // 年份/导演/类型等（.intro）
  rating: string;      // 1~5
  date: string;        // 标记日期
  comment: string;     // 短评（可为空）
  link: string;        // 豆瓣条目链接
}

// 影评记录
export interface ReviewItem {
  movie: string;
  title: string;
  rating: string;
  date: string;
  abstract: string;
  link: string;
}

// 断点进度
export interface Progress {
  collectStart: number;
  collectDone: boolean;
  reviewsPage: number;
  reviewsDone: boolean;
}

// 增量同步状态
export interface SyncState {
  lastSyncDate: string | null;
}

// 增量输出
export interface IncrementalData {
  collect: CollectItem[];
  reviews: ReviewItem[];
}
