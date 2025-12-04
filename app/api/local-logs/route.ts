import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DEBUG = process.env.DEBUG === 'true'

function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log('[LOCAL-LOGS]', ...args)
  }
}

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
  debug?: {
    envValue: string | undefined
    pathExists: boolean
    isDirectory: boolean
  }
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

  debugLog('LOCAL_LOGS_PATH env value:', localLogsPath)
  debugLog('All env vars with LOCAL:', Object.keys(process.env).filter(k => k.includes('LOCAL')))

  if (!localLogsPath) {
    debugLog('LOCAL_LOGS_PATH not set, returning disabled')
    return NextResponse.json({
      enabled: false,
      path: null,
      folders: [],
      debug: DEBUG ? {
        envValue: localLogsPath,
        pathExists: false,
        isDirectory: false
      } : undefined
    } as LocalLogsConfig)
  }

  // Validate the path exists and is readable
  let pathExists = false
  let isDirectory = false

  try {
    const stat = fs.statSync(localLogsPath)
    pathExists = true
    isDirectory = stat.isDirectory()
    debugLog('Path exists:', pathExists, 'Is directory:', isDirectory)

    if (!isDirectory) {
      return NextResponse.json({
        enabled: false,
        path: localLogsPath,
        folders: [],
        error: 'LOCAL_LOGS_PATH is not a directory',
        debug: DEBUG ? {
          envValue: localLogsPath,
          pathExists,
          isDirectory
        } : undefined
      })
    }
  } catch (err) {
    debugLog('Error checking path:', err)
    return NextResponse.json({
      enabled: false,
      path: localLogsPath,
      folders: [],
      error: 'LOCAL_LOGS_PATH does not exist or is not accessible',
      debug: DEBUG ? {
        envValue: localLogsPath,
        pathExists: false,
        isDirectory: false
      } : undefined
    })
  }

  // List folders in the logs directory
  const folders: LogFolder[] = []

  try {
    const items = fs.readdirSync(localLogsPath)
    debugLog('Found items in directory:', items.length)

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
    debugLog('Error reading directory:', error)
    return NextResponse.json({
      enabled: false,
      path: localLogsPath,
      folders: [],
      error: 'Unable to read LOCAL_LOGS_PATH directory',
      debug: DEBUG ? {
        envValue: localLogsPath,
        pathExists,
        isDirectory
      } : undefined
    })
  }

  debugLog('Returning enabled with', folders.length, 'folders')

  return NextResponse.json({
    enabled: true,
    path: localLogsPath,
    folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
    debug: DEBUG ? {
      envValue: localLogsPath,
      pathExists,
      isDirectory
    } : undefined
  } as LocalLogsConfig)
}
