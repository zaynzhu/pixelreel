export type DataHealthCategory = "movie" | "tv_show" | "game"
export type DataHealthIssue =
  | "missing_poster"
  | "missing_overview"
  | "missing_date"
  | "missing_external_id"

export interface DataHealthCategorySummary {
  total: number
  missingPoster: number
  missingOverview: number | null
  missingDate: number | null
  missingExternalId: number
}

export interface DataHealthSummary {
  total: number
  categories: Record<DataHealthCategory, DataHealthCategorySummary>
}

export interface DataHealthIssueItem {
  id: number
  category: DataHealthCategory
  title: string
  posterUrl: string | null
  updatedAt: string
}

export interface DataHealthIssueResponse {
  items: DataHealthIssueItem[]
  total: number
  nextCursor: string | null
}

export type DuplicateReason =
  | "douban_id" | "tmdb_id" | "imdb_id" | "trakt_id"
  | "rawg_id" | "steam_id" | "xbox_id" | "psn_id"
  | "title_year" | "title_platform" | "title_cross_platform"

export interface DuplicateRecord {
  id: number
  category: DataHealthCategory
  title: string
  posterUrl: string | null
  year: string | null
  platform: string | null
  status: string | null
  rating: number | null
  hasReview: boolean
  playtimeMinutes: number | null
  importReviewState: "PENDING" | "ACCEPTED" | "IGNORED" | null
  protected: boolean
  sourceIds: Partial<Record<DuplicateReason, string>>
}

export interface DuplicateGroup {
  key: string
  reasons: DuplicateReason[]
  records: DuplicateRecord[]
  reviewId: number | null
}

export interface DuplicateGroupResponse {
  groups: DuplicateGroup[]
  totalGroups: number
  totalRecords: number
  unreviewedGroups: number
  reviewedGroups: number
  nextCursor: string | null
}

export type GameMergeBlocker = "status" | "rating" | "review" | "rawg"

export interface GameMergePreview {
  targetId: number
  targetTitle: string
  removedIds: number[]
  canMerge: boolean
  blockers: GameMergeBlocker[]
  platformProfiles: {
    retained: number
    moved: number
    total: number
  }
  result: {
    status: string
    rating: number | null
    hasReview: boolean
    importReviewState: "PENDING" | "ACCEPTED" | "IGNORED"
  } | null
}
