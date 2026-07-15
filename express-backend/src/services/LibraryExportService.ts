import { getDb } from '../config/db'
import { serializeBigIntForJson } from '../json'

export const LIBRARY_EXPORT_FORMAT = 'pixelreel-library-export'
export const LIBRARY_EXPORT_VERSION = 1

interface LibraryExportRecords {
  movies: unknown[]
  tvShows: unknown[]
  games: unknown[]
}

export function buildLibraryExportSnapshot(records: LibraryExportRecords, exportedAt: Date) {
  return {
    format: LIBRARY_EXPORT_FORMAT,
    version: LIBRARY_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    counts: {
      movies: records.movies.length,
      tvShows: records.tvShows.length,
      games: records.games.length,
      total: records.movies.length + records.tvShows.length + records.games.length,
    },
    records,
  }
}

export function serializeLibraryExportSnapshot(snapshot: ReturnType<typeof buildLibraryExportSnapshot>) {
  return JSON.stringify(snapshot, (_key, value) => (
    typeof value === 'bigint' ? serializeBigIntForJson(value) : value
  ), 2)
}

export function libraryExportFilename(exportedAt: Date) {
  const timestamp = exportedAt.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
  return `pixelreel-library-${timestamp}.json`
}

export async function exportLibrarySnapshot(exportedAt = new Date()) {
  const db = getDb()
  const [movies, tvShows, games] = await db.$transaction([
    db.movie.findMany({ orderBy: { id: 'asc' } }),
    db.tvShow.findMany({ orderBy: { id: 'asc' } }),
    db.game.findMany({ orderBy: { id: 'asc' } }),
  ])
  const snapshot = buildLibraryExportSnapshot({ movies, tvShows, games }, exportedAt)
  return {
    filename: libraryExportFilename(exportedAt),
    json: serializeLibraryExportSnapshot(snapshot),
    snapshot,
  }
}
