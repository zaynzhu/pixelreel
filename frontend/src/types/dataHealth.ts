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
