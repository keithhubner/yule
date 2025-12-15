'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Folder, FolderOpen, ChevronRight, ChevronUp, Loader2, Home, AlertCircle, ArrowUpDown, ArrowDownAZ, Clock } from 'lucide-react'

interface FolderItem {
  name: string
  path: string
  isDirectory: boolean
  hasSubfolders: boolean
  modifiedAt: string | null
}

function formatDate(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface BrowseResponse {
  currentPath: string
  parentPath: string | null
  items: FolderItem[]
  error?: string
}

interface FolderBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
  initialPath?: string
}

export function FolderBrowser({ open, onOpenChange, onSelect, initialPath }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || '')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [items, setItems] = useState<FolderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState<string>('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name')

  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === 'date') {
      // Sort by date descending (newest first)
      const dateA = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0
      const dateB = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0
      return dateB - dateA
    }
    // Sort by name ascending
    return a.name.localeCompare(b.name)
  })

  const loadFolder = async (path: string | null) => {
    setLoading(true)
    setError(null)
    setSelectedPath(null)

    try {
      const url = path
        ? `/api/browse-folders?path=${encodeURIComponent(path)}`
        : '/api/browse-folders'

      const response = await fetch(url)
      const data: BrowseResponse = await response.json()

      if (data.error) {
        setError(data.error)
      }

      setCurrentPath(data.currentPath)
      setParentPath(data.parentPath)
      setItems(data.items)
      setManualPath(data.currentPath)
    } catch {
      setError('Failed to load folder')
    } finally {
      setLoading(false)
    }
  }

  // Load initial folder when dialog opens
  useEffect(() => {
    if (open) {
      loadFolder(initialPath || null)
    }
  }, [open, initialPath])

  const handleFolderClick = (folder: FolderItem) => {
    if (selectedPath === folder.path) {
      // Double click - navigate into folder
      loadFolder(folder.path)
    } else {
      // Single click - select folder
      setSelectedPath(folder.path)
      setManualPath(folder.path)
    }
  }

  const handleFolderDoubleClick = (folder: FolderItem) => {
    loadFolder(folder.path)
  }

  const handleGoUp = () => {
    if (parentPath) {
      loadFolder(parentPath)
    } else {
      loadFolder(null) // Go back to quick access
    }
  }

  const handleGoHome = () => {
    loadFolder(null)
  }

  const handleManualPathSubmit = () => {
    if (manualPath.trim()) {
      loadFolder(manualPath.trim())
    }
  }

  const handleSelect = () => {
    const pathToSelect = selectedPath || currentPath
    if (pathToSelect) {
      onSelect(pathToSelect)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Browse Folders</DialogTitle>
        </DialogHeader>

        {/* Path input */}
        <div className="flex gap-2">
          <Input
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualPathSubmit()}
            placeholder="Enter path..."
            className="flex-1 font-mono text-sm"
          />
          <Button variant="secondary" size="sm" onClick={handleManualPathSubmit}>
            Go
          </Button>
        </div>

        {/* Navigation buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoHome}
            disabled={loading || (!currentPath && !parentPath)}
          >
            <Home className="h-4 w-4 mr-1" />
            Quick Access
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoUp}
            disabled={loading || (!parentPath && !currentPath)}
          >
            <ChevronUp className="h-4 w-4 mr-1" />
            Up
          </Button>
          <Button
            variant={sortBy === 'date' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy(sortBy === 'name' ? 'date' : 'name')}
            title={sortBy === 'name' ? 'Sort by date' : 'Sort by name'}
          >
            {sortBy === 'name' ? (
              <>
                <Clock className="h-4 w-4 mr-1" />
                Date
              </>
            ) : (
              <>
                <ArrowDownAZ className="h-4 w-4 mr-1" />
                Name
              </>
            )}
          </Button>
          {currentPath && (
            <span className="flex-1 text-sm text-muted-foreground truncate self-center px-2">
              {currentPath}
            </span>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto border rounded-lg min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {currentPath ? 'No subfolders found' : 'No accessible locations'}
            </div>
          ) : (
            <div className="divide-y">
              {sortedItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleFolderClick(item)}
                  onDoubleClick={() => handleFolderDoubleClick(item)}
                  className={`w-full flex items-center gap-3 p-3 text-left hover:bg-accent transition-colors ${
                    selectedPath === item.path ? 'bg-accent' : ''
                  }`}
                >
                  {selectedPath === item.path ? (
                    <FolderOpen className="h-5 w-5 text-primary flex-shrink-0" />
                  ) : (
                    <Folder className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{item.name}</div>
                    {item.modifiedAt && (
                      <div className="text-xs text-muted-foreground">
                        Modified: {formatDate(item.modifiedAt)}
                      </div>
                    )}
                  </div>
                  {item.hasSubfolders && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected path indicator */}
        {selectedPath && (
          <div className="text-sm text-muted-foreground">
            Selected: <code className="bg-muted px-1 py-0.5 rounded">{selectedPath}</code>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedPath && !currentPath}
          >
            {selectedPath ? 'Select Folder' : 'Use Current Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
