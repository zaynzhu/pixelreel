import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { getDb } from '../config/db'
import { serializeBigIntForJson } from '../json'

export const LIBRARY_EXPORT_FORMAT = 'pixelreel-library-export'
export const LIBRARY_EXPORT_VERSION = 2

export interface LibraryExportRecords {
  movies: unknown[]
  tvShows: unknown[]
  games: unknown[]
}

function jsonExportReplacer(_key: string, value: unknown) {
  return typeof value === 'bigint' ? serializeBigIntForJson(value) : value
}

function countPlatformProfiles(games: unknown[]) {
  return games.reduce<number>((count, game) => {
    if (!game || typeof game !== 'object' || Array.isArray(game)) return count
    const platformEntries = (game as { platformEntries?: unknown }).platformEntries
    return count + (Array.isArray(platformEntries) ? platformEntries.length : 0)
  }, 0)
}

export function calculateLibraryRecordsSha256(records: LibraryExportRecords) {
  return createHash('sha256')
    .update(JSON.stringify(records, jsonExportReplacer))
    .digest('hex')
}

export function buildLibraryExportSnapshot(records: LibraryExportRecords, exportedAt: Date) {
  const platformProfiles = countPlatformProfiles(records.games)
  return {
    format: LIBRARY_EXPORT_FORMAT,
    version: LIBRARY_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    counts: {
      movies: records.movies.length,
      tvShows: records.tvShows.length,
      games: records.games.length,
      platformProfiles,
      total: records.movies.length + records.tvShows.length + records.games.length,
    },
    integrity: {
      algorithm: 'sha256',
      recordsSha256: calculateLibraryRecordsSha256(records),
    },
    records,
  }
}

export function serializeLibraryExportSnapshot(snapshot: ReturnType<typeof buildLibraryExportSnapshot>) {
  return JSON.stringify(snapshot, jsonExportReplacer, 2)
}

export function libraryExportFilename(exportedAt: Date) {
  const timestamp = exportedAt.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')
  return `pixelreel-library-${timestamp}.json`
}

export async function readLibraryExportRecordsFromClient(
  db: Prisma.TransactionClient,
): Promise<LibraryExportRecords> {
  const [movies, tvShows, games] = await Promise.all([
    db.movie.findMany({ orderBy: { id: 'asc' } }),
    db.tvShow.findMany({ orderBy: { id: 'asc' } }),
    db.game.findMany({
      orderBy: { id: 'asc' },
      include: {
        platformEntries: {
          orderBy: [
            { platform: 'asc' },
            { externalId: 'asc' },
          ],
        },
      },
    }),
  ])
  return { movies, tvShows, games }
}

export async function readLibraryExportRecords(): Promise<LibraryExportRecords> {
  return getDb().$transaction(transaction => readLibraryExportRecordsFromClient(transaction))
}

export async function exportLibrarySnapshot(exportedAt = new Date()) {
  const records = await readLibraryExportRecords()
  const snapshot = buildLibraryExportSnapshot(records, exportedAt)
  return {
    filename: libraryExportFilename(exportedAt),
    json: serializeLibraryExportSnapshot(snapshot),
    snapshot,
  }
}
