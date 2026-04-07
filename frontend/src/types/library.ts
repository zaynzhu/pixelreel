export type RecordStatus = "UNSET" | "WANT" | "IN_PROGRESS" | "DONE";

export type LibraryCategory = "movie" | "game";

export type LibraryRecord = {
  id: number;
  category: LibraryCategory;
  title: string;
  posterUrl?: string | null;
  sourceKey: string;
  sourceLabel: string;
  platformLabel?: string | null;
  status: RecordStatus;
  rating?: number | null;
  shortReview?: string | null;
  playtimeMinutes?: number | null;
  achievementTotal?: number | null;
  achievementUnlocked?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  importedAt?: string | null;
};

export type LibraryRecordUpdateInput = {
  status: RecordStatus;
  rating?: number | null;
  shortReview?: string | null;
};
