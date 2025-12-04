import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Force dynamic rendering to read env vars at runtime
export const dynamic = 'force-dynamic'

interface LogEntry {
  folder: string
  file: string
  lineNumber: number
  content: string
  date: Date
}

interface DateRange {
  startDate: string | null
  endDate: string | null
}

function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime())
}

function processLogContent(content: string, folder: string, filename: string, dateRange: DateRange): LogEntry[] {
  const logPattern = /^(\d{4}-\d{2}-\d{2}.*?)\s+(\[(Error|Warning|Critical)\]|ERROR|WARN|CRITICAL).*?/i
  const logs: LogEntry[] = []

  const startDate = dateRange.startDate ? new Date(dateRange.startDate) : null
  const endDate = dateRange.endDate ? new Date(dateRange.endDate + 'T23:59:59') : null

  const lines = content.split('\n')
  let currentError: string[] = []
  let errorStartLine = 0
  let errorDate: Date | null = null

  const isInDateRange = (date: Date): boolean => {
    if (startDate && date < startDate) return false
    if (endDate && date > endDate) return false
    return true
  }

  lines.forEach((line, index) => {
    const match = line.match(logPattern)
    if (match) {
      if (currentError.length > 0 && errorDate) {
        const validErrorDate: Date = errorDate
        if (isInDateRange(validErrorDate)) {
          logs.push({
            folder,
            file: filename,
            lineNumber: errorStartLine + 1,
            content: currentError.join('\n').trim(),
            date: validErrorDate,
          })
        }
        currentError = []
        errorDate = null
      }
      errorStartLine = index
      currentError.push(line.trim())
      const parsedDate = new Date(match[1])
      if (isValidDate(parsedDate)) {
        errorDate = parsedDate
      }
    } else if (currentError.length > 0) {
      currentError.push(line.trim())
    }
  })

  if (currentError.length > 0 && errorDate) {
    const validErrorDate: Date = errorDate
    if (isInDateRange(validErrorDate)) {
      logs.push({
        folder,
        file: filename,
        lineNumber: errorStartLine + 1,
        content: currentError.join('\n').trim(),
        date: validErrorDate,
      })
    }
  }

  return logs
}

export async function POST(request: NextRequest) {
  const localLogsPath = process.env.LOCAL_LOGS_PATH

  if (!localLogsPath) {
    return NextResponse.json({ error: 'Local logs not configured' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { folders, startDate, endDate } = body as {
    folders: string[]
    startDate: string | null
    endDate: string | null
  }

  if (!folders || !Array.isArray(folders) || folders.length === 0) {
    return NextResponse.json({ error: 'No folders selected' }, { status: 400 })
  }

  // Validate date format if provided
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (startDate && !datePattern.test(startDate)) {
    return NextResponse.json({ error: 'Invalid start date format. Use YYYY-MM-DD.' }, { status: 400 })
  }
  if (endDate && !datePattern.test(endDate)) {
    return NextResponse.json({ error: 'Invalid end date format. Use YYYY-MM-DD.' }, { status: 400 })
  }

  const logs: LogEntry[] = []

  for (const folderName of folders) {
    // Security: Ensure folder name doesn't contain path traversal
    if (folderName.includes('..') || folderName.includes('/') || folderName.includes('\\')) {
      continue
    }

    const folderPath = path.join(localLogsPath, folderName)

    // Verify the folder is within the allowed path
    const resolvedPath = path.resolve(folderPath)
    const resolvedBase = path.resolve(localLogsPath)
    if (!resolvedPath.startsWith(resolvedBase)) {
      continue
    }

    try {
      const stat = fs.statSync(folderPath)
      if (!stat.isDirectory()) continue

      const files = fs.readdirSync(folderPath)

      for (const file of files) {
        if (!file.endsWith('.log') && !file.endsWith('.txt')) continue

        const filePath = path.join(folderPath, file)

        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          const fileLogs = processLogContent(content, folderName, file, {
            startDate,
            endDate
          })
          logs.push(...fileLogs)
        } catch {
          // Skip files we can't read
        }
      }
    } catch {
      // Skip folders we can't access
    }
  }

  return NextResponse.json({ logs })
}
