export function resolveCompletionDate(record: {
  doubanDate?: string | null
  updatedAt: Date | null
}): Date | null {
  const value = record.doubanDate?.trim()
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
      return date
    }
  }
  return record.updatedAt
}
