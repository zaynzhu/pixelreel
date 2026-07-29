export function resolveCompletionDate(record: {
  doubanDate?: string | null
  updatedAt: Date | null
}): Date | null {
  return parseDoubanCalendarDate(record.doubanDate)?.date ?? record.updatedAt
}

export function resolveCompletionCalendarParts(record: {
  doubanDate?: string | null
  updatedAt: Date | null
}) {
  const doubanDate = parseDoubanCalendarDate(record.doubanDate)
  if (doubanDate) {
    return {
      year: doubanDate.year,
      month: doubanDate.month,
      day: doubanDate.day,
    }
  }

  if (!record.updatedAt) return null
  return {
    year: record.updatedAt.getFullYear(),
    month: record.updatedAt.getMonth() + 1,
    day: record.updatedAt.getDate(),
  }
}

function parseDoubanCalendarDate(value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null

  const date = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    return null
  }

  return {
    date,
    year: Number(normalized.slice(0, 4)),
    month: Number(normalized.slice(5, 7)),
    day: Number(normalized.slice(8, 10)),
  }
}
