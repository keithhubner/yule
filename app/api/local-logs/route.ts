import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

interface LogFolder {
  name: string
  path: string
  fileCount: number
  totalSize: number
}

interface LocalLogsConfig {
  enabled: boolean
  path: string | null
  folders: LogFolder[]
}

function getDirectorySize(dirPath: string): { fileCount: number; totalSize: number } {
  let fileCount = 0
  let totalSize = 0

  try {
    const items = fs.readdirSync(dirPath)
    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      const stat = fs.statSync(itemPath)
      if (stat.isFile() && (item.endsWith('.log') || item.endsWith('.txt'))) {
        fileCount++
        totalSize += stat.size
      }
    }
  } catch {
    // Ignore errors reading directory
  }

  return { fileCount, totalSize }
}

export async function GET() {
  const localLogsPath = process.env.LOCAL_LOGS_PATH

  if (!localLogsPath) {
    return NextResponse.json({
      enabled: false,
      path: null,
      folders: []
    } as LocalLogsConfig)
  }

  // Validate the path exists and is readable
  try {
    const stat = fs.statSync(localLogsPath)
    if (!stat.isDirectory()) {
      return NextResponse.json({
        enabled: false,
        path: localLogsPath,
        folders: [],
        error: 'LOCAL_LOGS_PATH is not a directory'
      })
    }
  } catch {
    return NextResponse.json({
      enabled: false,
      path: localLogsPath,
      folders: [],
      error: 'LOCAL_LOGS_PATH does not exist or is not accessible'
    })
  }

  // List folders in the logs directory
  const folders: LogFolder[] = []

  try {
    const items = fs.readdirSync(localLogsPath)

    for (const item of items) {
      const itemPath = path.join(localLogsPath, item)

      try {
        const stat = fs.statSync(itemPath)

        if (stat.isDirectory()) {
          const { fileCount, totalSize } = getDirectorySize(itemPath)
          folders.push({
            name: item,
            path: itemPath,
            fileCount,
            totalSize
          })
        }
      } catch {
        // Skip items we can't stat
      }
    }
  } catch (error) {
    return NextResponse.json({
      enabled: false,
      path: localLogsPath,
      folders: [],
      error: 'Unable to read LOCAL_LOGS_PATH directory'
    })
  }

  return NextResponse.json({
    enabled: true,
    path: localLogsPath,
    folders: folders.sort((a, b) => a.name.localeCompare(b.name))
  } as LocalLogsConfig)
}
