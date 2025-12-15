import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

interface FolderItem {
  name: string
  path: string
  isDirectory: boolean
  hasSubfolders: boolean
  modifiedAt: string | null
}

interface BrowseResponse {
  currentPath: string
  parentPath: string | null
  items: FolderItem[]
  error?: string
}

function getModifiedDate(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath)
    return stat.mtime.toISOString()
  } catch {
    return null
  }
}

// Get common starting points for the folder browser
function getQuickAccessPaths(): FolderItem[] {
  const homedir = os.homedir()
  const paths: { name: string; path: string }[] = []

  // Home directory
  paths.push({ name: 'Home', path: homedir })

  // Common log locations based on OS
  const platform = os.platform()

  if (platform === 'darwin') {
    // macOS
    paths.push(
      { name: 'Logs', path: '/var/log' },
      { name: 'Library Logs', path: path.join(homedir, 'Library/Logs') },
    )
  } else if (platform === 'linux') {
    paths.push(
      { name: 'Var Log', path: '/var/log' },
      { name: 'Opt', path: '/opt' },
    )
  } else if (platform === 'win32') {
    paths.push(
      { name: 'ProgramData', path: 'C:\\ProgramData' },
      { name: 'Program Files', path: 'C:\\Program Files' },
    )
  }

  // Root
  paths.push({
    name: platform === 'win32' ? 'C:\\' : '/',
    path: platform === 'win32' ? 'C:\\' : '/',
  })

  // Filter to only paths that exist and add metadata
  return paths
    .filter(p => {
      try {
        fs.accessSync(p.path, fs.constants.R_OK)
        return true
      } catch {
        return false
      }
    })
    .map(p => ({
      name: p.name,
      path: p.path,
      isDirectory: true,
      hasSubfolders: true,
      modifiedAt: getModifiedDate(p.path),
    }))
}

function hasSubfolders(dirPath: string): boolean {
  try {
    const items = fs.readdirSync(dirPath)
    for (const item of items) {
      if (item.startsWith('.')) continue
      try {
        const itemPath = path.join(dirPath, item)
        const stat = fs.statSync(itemPath)
        if (stat.isDirectory()) return true
      } catch {
        continue
      }
    }
  } catch {
    // Can't read directory
  }
  return false
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const requestedPath = searchParams.get('path')

  // If no path provided, return quick access locations
  if (!requestedPath) {
    return NextResponse.json({
      currentPath: '',
      parentPath: null,
      items: getQuickAccessPaths(),
    } as BrowseResponse)
  }

  // Resolve and validate path
  const resolvedPath = path.resolve(requestedPath)

  try {
    const stat = fs.statSync(resolvedPath)
    if (!stat.isDirectory()) {
      return NextResponse.json({
        currentPath: resolvedPath,
        parentPath: path.dirname(resolvedPath),
        items: [],
        error: 'Path is not a directory',
      } as BrowseResponse)
    }
  } catch {
    return NextResponse.json({
      currentPath: resolvedPath,
      parentPath: null,
      items: getQuickAccessPaths(),
      error: 'Path does not exist or is not accessible',
    } as BrowseResponse)
  }

  // List directory contents
  const items: FolderItem[] = []

  try {
    const entries = fs.readdirSync(resolvedPath)

    for (const entry of entries) {
      // Skip hidden files/folders
      if (entry.startsWith('.')) continue

      const entryPath = path.join(resolvedPath, entry)

      try {
        const stat = fs.statSync(entryPath)
        if (stat.isDirectory()) {
          items.push({
            name: entry,
            path: entryPath,
            isDirectory: true,
            hasSubfolders: hasSubfolders(entryPath),
            modifiedAt: stat.mtime.toISOString(),
          })
        }
      } catch {
        // Skip items we can't stat
      }
    }
  } catch {
    return NextResponse.json({
      currentPath: resolvedPath,
      parentPath: path.dirname(resolvedPath),
      items: [],
      error: 'Unable to read directory',
    } as BrowseResponse)
  }

  // Sort folders alphabetically
  items.sort((a, b) => a.name.localeCompare(b.name))

  // Calculate parent path
  const parentPath = resolvedPath === '/' || resolvedPath === 'C:\\'
    ? null
    : path.dirname(resolvedPath)

  return NextResponse.json({
    currentPath: resolvedPath,
    parentPath,
    items,
  } as BrowseResponse)
}
