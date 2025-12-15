import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

interface LogEntry {
  folder: string
  file: string
  lineNumber: number
  content: string
  date: Date
  id: string
}

interface FileState {
  path: string
  folder: string
  relativePath: string
  size: number
  lastModified: number
}

function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime())
}

function processNewContent(
  content: string,
  folder: string,
  filename: string,
  startLine: number
): LogEntry[] {
  const logPattern = /^(\d{4}-\d{2}-\d{2}.*?)\s+(\[(Error|Warning|Critical)\]|ERROR|WARN|CRITICAL).*?/i
  const logs: LogEntry[] = []

  const lines = content.split('\n')
  let currentError: string[] = []
  let errorStartLine = startLine
  let errorDate: Date | null = null

  lines.forEach((line, index) => {
    const match = line.match(logPattern)
    if (match) {
      if (currentError.length > 0 && errorDate) {
        const validErrorDate: Date = errorDate
        const id = `${folder}-${filename}-${errorStartLine}-${validErrorDate.getTime()}`
        logs.push({
          folder,
          file: filename,
          lineNumber: errorStartLine + 1,
          content: currentError.join('\n').trim(),
          date: validErrorDate,
          id,
        })
        currentError = []
        errorDate = null
      }
      errorStartLine = startLine + index
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
    const id = `${folder}-${filename}-${errorStartLine}-${validErrorDate.getTime()}`
    logs.push({
      folder,
      file: filename,
      lineNumber: errorStartLine + 1,
      content: currentError.join('\n').trim(),
      date: validErrorDate,
      id,
    })
  }

  return logs
}

function findLogFilesRecursive(dirPath: string): string[] {
  const logFiles: string[] = []

  try {
    const items = fs.readdirSync(dirPath)
    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      try {
        const stat = fs.statSync(itemPath)
        if (stat.isDirectory()) {
          logFiles.push(...findLogFilesRecursive(itemPath))
        } else if (stat.isFile() && (item.endsWith('.log') || item.endsWith('.txt'))) {
          logFiles.push(itemPath)
        }
      } catch {
        // Skip items we can't access
      }
    }
  } catch {
    // Ignore errors reading directory
  }

  return logFiles
}

function getFileStates(localLogsPath: string, folders: string[]): FileState[] {
  const fileStates: FileState[] = []

  for (const folderName of folders) {
    if (folderName.includes('..') || folderName.includes('/') || folderName.includes('\\')) {
      continue
    }

    const folderPath = path.join(localLogsPath, folderName)
    const resolvedPath = path.resolve(folderPath)
    const resolvedBase = path.resolve(localLogsPath)

    if (!resolvedPath.startsWith(resolvedBase)) {
      continue
    }

    try {
      const stat = fs.statSync(folderPath)
      if (!stat.isDirectory()) continue

      const logFiles = findLogFilesRecursive(folderPath)

      for (const filePath of logFiles) {
        try {
          const fileStat = fs.statSync(filePath)
          const relativePath = path.relative(folderPath, filePath)
          fileStates.push({
            path: filePath,
            folder: folderName,
            relativePath,
            size: fileStat.size,
            lastModified: fileStat.mtimeMs,
          })
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Skip folders we can't access
    }
  }

  return fileStates
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const customPath = searchParams.get('path')
  const localLogsPath = customPath || process.env.LOCAL_LOGS_PATH

  if (!localLogsPath) {
    return new Response(JSON.stringify({ error: 'No logs path configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const foldersParam = searchParams.get('folders')

  if (!foldersParam) {
    return new Response(JSON.stringify({ error: 'No folders specified' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const folders = foldersParam.split(',')

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  let isActive = true

  const stream = new ReadableStream({
    async start(controller) {
      // Track file states
      let fileStates = getFileStates(localLogsPath, folders)
      const fileSizeMap = new Map<string, number>()
      const fileLineMap = new Map<string, number>()

      // Initialize with current file sizes
      for (const file of fileStates) {
        fileSizeMap.set(file.path, file.size)
        try {
          const content = fs.readFileSync(file.path, 'utf-8')
          fileLineMap.set(file.path, content.split('\n').length)
        } catch {
          fileLineMap.set(file.path, 0)
        }
      }

      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', message: 'Live tail started' })}\n\n`))

      // Poll for changes
      const pollInterval = setInterval(() => {
        if (!isActive) {
          clearInterval(pollInterval)
          return
        }

        try {
          // Refresh file states to catch new files
          const currentFileStates = getFileStates(localLogsPath, folders)

          for (const file of currentFileStates) {
            const previousSize = fileSizeMap.get(file.path) || 0
            const previousLineCount = fileLineMap.get(file.path) || 0

            // Check if file has grown
            if (file.size > previousSize) {
              try {
                const content = fs.readFileSync(file.path, 'utf-8')
                const lines = content.split('\n')
                const newLines = lines.slice(previousLineCount)

                if (newLines.length > 0) {
                  const newContent = newLines.join('\n')
                  const newLogs = processNewContent(
                    newContent,
                    file.folder,
                    file.relativePath,
                    previousLineCount
                  )

                  for (const log of newLogs) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'log', log })}\n\n`)
                    )
                  }

                  fileLineMap.set(file.path, lines.length)
                }

                fileSizeMap.set(file.path, file.size)
              } catch {
                // Skip files we can't read
              }
            } else if (!fileSizeMap.has(file.path)) {
              // New file detected
              fileSizeMap.set(file.path, file.size)
              try {
                const content = fs.readFileSync(file.path, 'utf-8')
                fileLineMap.set(file.path, content.split('\n').length)
              } catch {
                fileLineMap.set(file.path, 0)
              }
            }
          }

          // Send heartbeat
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`))
        } catch (error) {
          console.error('Polling error:', error)
        }
      }, 1000) // Poll every second

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        isActive = false
        clearInterval(pollInterval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
