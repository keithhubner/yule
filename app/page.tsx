'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogTable } from './log-table'
import { Loader2, FileText, Search, FolderOpen, Calendar, FileWarning, HelpCircle, Server, Radio, Square } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CopyButton } from '@/components/ui/copy-button'
import { FolderBrowser } from '@/components/ui/folder-browser'

interface Log {
  folder: string
  file: string
  lineNumber: number
  content: string
  date: Date
}

interface ArchiveAnalysis {
  totalFiles: number
  logFiles: number
  totalSize: number
  folders: string[]
  dateRange: {
    earliest: string | null
    latest: string | null
  }
  estimatedLogEntries: number
}

interface LocalLogFolder {
  name: string
  path: string
  fileCount: number
  totalSize: number
}

interface LocalLogsConfig {
  enabled: boolean
  path: string | null
  folders: LocalLogFolder[]
  isCustomPath?: boolean
  error?: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30)
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  }
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [startDate, setStartDate] = useState<string>(getDefaultDateRange().startDate)
  const [endDate, setEndDate] = useState<string>(getDefaultDateRange().endDate)
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<ArchiveAnalysis | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string>('')

  // Local logs state (server-side when LOCAL_LOGS_PATH is configured)
  const [serverLogsConfig, setServerLogsConfig] = useState<LocalLogsConfig | null>(null)
  const [selectedServerFolders, setSelectedServerFolders] = useState<string[]>([])

  // Browse folder state (client-side folder browser)
  const [browseLogsConfig, setBrowseLogsConfig] = useState<LocalLogsConfig | null>(null)
  const [selectedBrowseFolders, setSelectedBrowseFolders] = useState<string[]>([])
  const [browsePath, setBrowsePath] = useState<string>('')
  const [loadingPath, setLoadingPath] = useState(false)
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false)

  // Mode: 'archive' | 'server' | 'browse'
  const [mode, setMode] = useState<'archive' | 'server' | 'browse'>('archive')

  // Live tail state
  const [liveTailEnabled, setLiveTailEnabled] = useState(false)
  const [liveTailConnected, setLiveTailConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const seenLogIdsRef = useRef<Set<string>>(new Set())

  // Check if server logs are enabled on mount (LOCAL_LOGS_PATH env var)
  useEffect(() => {
    fetch('/api/local-logs')
      .then(res => res.json())
      .then((config: LocalLogsConfig) => {
        setServerLogsConfig(config)
      })
      .catch(() => {
        setServerLogsConfig({ enabled: false, path: null, folders: [] })
      })
  }, [])

  // Auto-populate date range when analysis completes
  useEffect(() => {
    if (analysis?.dateRange.earliest && analysis?.dateRange.latest) {
      setStartDate(analysis.dateRange.earliest)
      setEndDate(analysis.dateRange.latest)
    }
  }, [analysis])

  // Stop live tail when leaving local logs mode or when folders change
  const stopLiveTail = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setLiveTailConnected(false)
    setLiveTailEnabled(false)
  }, [])

  // Live tail connection effect (only for server logs mode)
  useEffect(() => {
    if (!liveTailEnabled || selectedServerFolders.length === 0 || mode !== 'server') {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setLiveTailConnected(false)
      }
      return
    }

    const foldersParam = selectedServerFolders.join(',')
    const eventSource = new EventSource(`/api/local-logs/tail?folders=${encodeURIComponent(foldersParam)}`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setLiveTailConnected(true)
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'connected') {
          setProgress('Live tail connected - watching for new logs...')
          setTimeout(() => setProgress(''), 3000)
        } else if (data.type === 'log') {
          const log = data.log
          // Deduplicate logs by ID
          if (!seenLogIdsRef.current.has(log.id)) {
            seenLogIdsRef.current.add(log.id)
            setLogs(prevLogs => [...prevLogs, {
              folder: log.folder,
              file: log.file,
              lineNumber: log.lineNumber,
              content: log.content,
              date: new Date(log.date),
            }])
          }
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err)
      }
    }

    eventSource.onerror = () => {
      setLiveTailConnected(false)
      setError('Live tail connection lost. Please try again.')
      stopLiveTail()
    }

    return () => {
      eventSource.close()
      setLiveTailConnected(false)
    }
  }, [liveTailEnabled, selectedServerFolders, stopLiveTail, mode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const validateFile = (selectedFile: File): string | null => {
    const supportedTypes = ['.zip', '.tar.gz', '.tgz']
    const isSupported = supportedTypes.some(type =>
      selectedFile.name.toLowerCase().endsWith(type)
    )

    if (!isSupported) {
      return 'Please select a .zip, .tar.gz, or .tgz file'
    }

    const maxFileSizeMB = 100
    const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024
    if (selectedFile.size > maxFileSizeBytes) {
      return `File size exceeds maximum allowed size of ${maxFileSizeMB}MB`
    }

    return null
  }

  const handleFileChange = (selectedFile: File | null) => {
    // Reset all state when file changes
    setFile(selectedFile)
    setAnalysis(null)
    setLogs([])
    setError('')
    setProgress('')
    // Reset to default date range
    const defaults = getDefaultDateRange()
    setStartDate(defaults.startDate)
    setEndDate(defaults.endDate)
  }

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please select an archive file')
      return
    }

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setAnalyzing(true)
    setError('')
    setProgress('Analyzing archive structure...')

    try {
      const formData = new FormData()
      formData.append('archiveFile', file)

      const response = await fetch('/api/analyze-logs', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze archive')
      }

      const analysisResult = data.analysis as ArchiveAnalysis

      // Validate analysis results
      if (analysisResult.totalFiles === 0) {
        setError('The archive appears to be empty or could not be read.')
        return
      }

      if (analysisResult.logFiles === 0) {
        setError('No log files (.log or .txt) were found in this archive. Please ensure your archive contains log files.')
        return
      }

      if (analysisResult.estimatedLogEntries === 0) {
        setError('No error or warning entries were found in the log files. The logs may be empty or in an unsupported format.')
        return
      }

      setAnalysis(analysisResult)
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unknown error occurred while analyzing the archive')
      }
    } finally {
      setAnalyzing(false)
      setProgress('')
    }
  }

  const handleExtract = async () => {
    if (!file) {
      setError('Please select an archive file')
      return
    }

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      setError('Start date must be before or equal to end date')
      return
    }

    setLoading(true)
    setError('')
    setProgress('Preparing extraction...')

    try {
      const formData = new FormData()
      formData.append('archiveFile', file)
      if (startDate) formData.append('startDate', startDate)
      if (endDate) formData.append('endDate', endDate)

      setProgress('Extracting and processing log files...')

      const response = await fetch('/api/extract-logs', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract logs')
      }

      setProgress(`Found ${data.logs.length} log entries`)
      setLogs(data.logs)
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unknown error occurred')
      }
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(''), 2000)
    }
  }

  const handleClear = () => {
    // Stop live tail if active
    stopLiveTail()
    seenLogIdsRef.current.clear()
    // Reset file input element
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    // Reset all state
    setFile(null)
    setAnalysis(null)
    setLogs([])
    setError('')
    setProgress('')
    setSelectedServerFolders([])
    setSelectedBrowseFolders([])
    const defaults = getDefaultDateRange()
    setStartDate(defaults.startDate)
    setEndDate(defaults.endDate)
  }

  // Server logs folder toggle
  const handleServerFolderToggle = (folderName: string) => {
    setSelectedServerFolders(prev =>
      prev.includes(folderName)
        ? prev.filter(f => f !== folderName)
        : [...prev, folderName]
    )
  }

  // Browse folder toggle
  const handleBrowseFolderToggle = (folderName: string) => {
    setSelectedBrowseFolders(prev =>
      prev.includes(folderName)
        ? prev.filter(f => f !== folderName)
        : [...prev, folderName]
    )
  }

  const handleLoadBrowsePath = async (pathToLoad?: string) => {
    const targetPath = pathToLoad || browsePath.trim()
    if (!targetPath) {
      setError('Please enter a folder path')
      return
    }

    setLoadingPath(true)
    setError('')
    setSelectedBrowseFolders([])

    try {
      const response = await fetch(`/api/local-logs?path=${encodeURIComponent(targetPath)}`)
      const config: LocalLogsConfig = await response.json()

      if (config.error) {
        setError(config.error)
        setBrowseLogsConfig({ enabled: false, path: null, folders: [], isCustomPath: true })
      } else {
        setBrowseLogsConfig(config)
        setBrowsePath(targetPath)
      }
    } catch {
      setError('Failed to load folder')
      setBrowseLogsConfig({ enabled: false, path: null, folders: [], isCustomPath: true })
    } finally {
      setLoadingPath(false)
    }
  }

  const handleFolderBrowserSelect = (path: string) => {
    setBrowsePath(path)
    handleLoadBrowsePath(path)
  }

  const handleSelectAllServerFolders = () => {
    if (serverLogsConfig?.folders) {
      if (selectedServerFolders.length === serverLogsConfig.folders.length) {
        setSelectedServerFolders([])
      } else {
        setSelectedServerFolders(serverLogsConfig.folders.map(f => f.name))
      }
    }
  }

  const handleSelectAllBrowseFolders = () => {
    if (browseLogsConfig?.folders) {
      if (selectedBrowseFolders.length === browseLogsConfig.folders.length) {
        setSelectedBrowseFolders([])
      } else {
        setSelectedBrowseFolders(browseLogsConfig.folders.map(f => f.name))
      }
    }
  }

  // Extract logs from server logs (LOCAL_LOGS_PATH)
  const handleExtractServerLogs = async () => {
    if (selectedServerFolders.length === 0) {
      setError('Please select at least one folder')
      return
    }

    if (startDate && endDate && startDate > endDate) {
      setError('Start date must be before or equal to end date')
      return
    }

    setLoading(true)
    setError('')
    setProgress('Reading server log files...')

    try {
      const response = await fetch('/api/local-logs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folders: selectedServerFolders,
          startDate,
          endDate
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract logs')
      }

      setProgress(`Found ${data.logs.length} log entries`)
      setLogs(data.logs)
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unknown error occurred')
      }
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(''), 2000)
    }
  }

  // Extract logs from browsed folder
  const handleExtractBrowseLogs = async () => {
    if (selectedBrowseFolders.length === 0) {
      setError('Please select at least one folder')
      return
    }

    if (startDate && endDate && startDate > endDate) {
      setError('Start date must be before or equal to end date')
      return
    }

    setLoading(true)
    setError('')
    setProgress('Reading log files...')

    try {
      const response = await fetch('/api/local-logs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folders: selectedBrowseFolders,
          startDate,
          endDate,
          customPath: browseLogsConfig?.path
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract logs')
      }

      setProgress(`Found ${data.logs.length} log entries`)
      setLogs(data.logs)
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unknown error occurred')
      }
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(''), 2000)
    }
  }

  const switchMode = (newMode: 'archive' | 'server' | 'browse') => {
    stopLiveTail()
    handleClear()
    setMode(newMode)
    // For browse mode, use a wider default date range (1 year back)
    if (newMode === 'browse') {
      const endDate = new Date()
      const startDate = new Date()
      startDate.setFullYear(startDate.getFullYear() - 1)
      setStartDate(startDate.toISOString().split('T')[0])
      setEndDate(endDate.toISOString().split('T')[0])
    }
  }

  const handleStartLiveTail = () => {
    if (selectedServerFolders.length === 0) {
      setError('Please select at least one folder')
      return
    }
    // Clear existing logs when starting live tail
    setLogs([])
    seenLogIdsRef.current.clear()
    setLiveTailEnabled(true)
  }

  const handleStopLiveTail = () => {
    stopLiveTail()
    setProgress('Live tail stopped')
    setTimeout(() => setProgress(''), 2000)
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center mb-4">
        <FileText className="h-6 w-6 mr-2 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-bold">Log Extractor</h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="font-semibold text-red-800">Error</h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => setError('')}
            className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mode switcher */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={mode === 'archive' ? 'default' : 'outline'}
          onClick={() => switchMode('archive')}
          className="flex-1"
        >
          <FileText className="mr-2 h-4 w-4" />
          Upload Archive
        </Button>
        {serverLogsConfig?.enabled && (
          <Button
            variant={mode === 'server' ? 'default' : 'outline'}
            onClick={() => switchMode('server')}
            className="flex-1"
          >
            <Server className="mr-2 h-4 w-4" />
            Server Logs
          </Button>
        )}
        <Button
          variant={mode === 'browse' ? 'default' : 'outline'}
          onClick={() => switchMode('browse')}
          className="flex-1"
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          Browse Folder
        </Button>
      </div>

      <div className="space-y-4">
        {/* SERVER LOGS MODE - when LOCAL_LOGS_PATH is configured */}
        {mode === 'server' && serverLogsConfig?.enabled && (
          <>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Server className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Server Log Folders</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Reading from: <code className="bg-background px-1 py-0.5 rounded">{serverLogsConfig.path}</code>
              </p>

              {serverLogsConfig.folders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No log folders found in the configured path.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">Select folders to analyze:</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAllServerFolders}
                      className="text-xs h-6"
                    >
                      {selectedServerFolders.length === serverLogsConfig.folders.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {serverLogsConfig.folders.map((folder) => (
                      <button
                        key={folder.name}
                        onClick={() => handleServerFolderToggle(folder.name)}
                        className={`p-2 rounded-lg text-left text-xs transition-colors ${
                          selectedServerFolders.includes(folder.name)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-accent'
                        }`}
                      >
                        <div className="font-medium truncate">{folder.name}</div>
                        <div className="text-[10px] opacity-70">
                          {folder.fileCount} files ({formatBytes(folder.totalSize)})
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {selectedServerFolders.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="serverStartDate">From Date</Label>
                    <Input
                      id="serverStartDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="serverEndDate">To Date</Label>
                    <Input
                      id="serverEndDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Filter log entries by date range.
                </p>

                {progress && (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm">{progress}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleExtractServerLogs}
                    disabled={loading || liveTailEnabled}
                    className="flex-1"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Extract Logs ({selectedServerFolders.length} folder{selectedServerFolders.length !== 1 ? 's' : ''})
                      </>
                    )}
                  </Button>
                  {liveTailEnabled ? (
                    <Button
                      onClick={handleStopLiveTail}
                      variant="destructive"
                      className="flex-1"
                    >
                      <Square className="mr-2 h-4 w-4" />
                      Stop Live Tail
                      {liveTailConnected && (
                        <span className="ml-2 h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStartLiveTail}
                      variant="secondary"
                      disabled={loading}
                      className="flex-1"
                    >
                      <Radio className="mr-2 h-4 w-4" />
                      Live Tail
                    </Button>
                  )}
                  <Button
                    onClick={handleClear}
                    variant="outline"
                    disabled={loading || liveTailEnabled}
                  >
                    Clear
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {/* BROWSE FOLDER MODE */}
        {mode === 'browse' && (
          <>
            {/* Folder browser */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Select Folder</h3>
              </div>

              {browseLogsConfig?.enabled && browseLogsConfig.path ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-2 bg-background rounded border">
                    <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
                    <code className="text-sm flex-1 truncate">{browseLogsConfig.path}</code>
                  </div>
                  <Button
                    onClick={() => setFolderBrowserOpen(true)}
                    variant="outline"
                    className="w-full"
                    disabled={loadingPath}
                  >
                    {loadingPath ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <FolderOpen className="h-4 w-4 mr-2" />
                    )}
                    Change Folder
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setFolderBrowserOpen(true)}
                  variant="secondary"
                  className="w-full"
                  disabled={loadingPath}
                >
                  {loadingPath ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FolderOpen className="h-4 w-4 mr-2" />
                  )}
                  Browse for Folder
                </Button>
              )}
            </div>

            <FolderBrowser
              open={folderBrowserOpen}
              onOpenChange={setFolderBrowserOpen}
              onSelect={handleFolderBrowserSelect}
              initialPath={browsePath || undefined}
            />

            {/* Folder selection - only show when folders are loaded */}
            {browseLogsConfig?.enabled && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Log Folders</h3>
                </div>

                {browseLogsConfig.folders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No log folders found in the selected path.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Select folders to analyze:</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAllBrowseFolders}
                        className="text-xs h-6"
                      >
                        {selectedBrowseFolders.length === browseLogsConfig.folders.length ? 'Deselect All' : 'Select All'}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {browseLogsConfig.folders.map((folder) => (
                        <button
                          key={folder.name}
                          onClick={() => handleBrowseFolderToggle(folder.name)}
                          className={`p-2 rounded-lg text-left text-xs transition-colors ${
                            selectedBrowseFolders.includes(folder.name)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-accent'
                          }`}
                        >
                          <div className="font-medium truncate">{folder.name}</div>
                          <div className="text-[10px] opacity-70">
                            {folder.fileCount} files ({formatBytes(folder.totalSize)})
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {selectedBrowseFolders.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="browseStartDate">From Date</Label>
                    <Input
                      id="browseStartDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="browseEndDate">To Date</Label>
                    <Input
                      id="browseEndDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Filter log entries by date range.
                </p>

                {progress && (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm">{progress}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleExtractBrowseLogs}
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Extract Logs ({selectedBrowseFolders.length} folder{selectedBrowseFolders.length !== 1 ? 's' : ''})
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleClear}
                    variant="outline"
                    disabled={loading}
                  >
                    Clear
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {/* ARCHIVE UPLOAD MODE */}
        {mode === 'archive' && (
          <>
        <div>
          <div className="flex items-center gap-2">
            <Label htmlFor="archiveFile">Archive File</Label>
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Help: How to create log archives"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>How to Create Log Archives</DialogTitle>
                  <DialogDescription>
                    Instructions for creating log archives from Bitwarden self-hosted installations
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-semibold mb-2">Linux Server</h3>
                    <p className="text-muted-foreground mb-2">
                      Bitwarden logs are typically located in <code className="bg-muted px-1 py-0.5 rounded">/opt/bitwarden/bwdata/logs/</code>
                    </p>
                    <div className="bg-muted p-3 rounded-lg font-mono text-xs space-y-1">
                      <p className="text-muted-foreground"># Navigate to the Bitwarden data directory</p>
                      <div className="flex items-center justify-between group">
                        <p>cd /opt/bitwarden/bwdata</p>
                        <CopyButton value="cd /opt/bitwarden/bwdata" className="opacity-0 group-hover:opacity-100" />
                      </div>
                      <p className="text-muted-foreground mt-2"># Create a zip archive of all logs</p>
                      <div className="flex items-center justify-between group">
                        <p>zip -r bitwarden-logs.zip logs/</p>
                        <CopyButton value="zip -r bitwarden-logs.zip logs/" className="opacity-0 group-hover:opacity-100" />
                      </div>
                      <p className="text-muted-foreground mt-2"># Or create a tar.gz archive</p>
                      <div className="flex items-center justify-between group">
                        <p>tar -czvf bitwarden-logs.tar.gz logs/</p>
                        <CopyButton value="tar -czvf bitwarden-logs.tar.gz logs/" className="opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Windows Server</h3>
                    <p className="text-muted-foreground mb-2">
                      Bitwarden logs are typically located in <code className="bg-muted px-1 py-0.5 rounded">C:\ProgramData\bitwarden\bwdata\logs\</code>
                    </p>
                    <div className="bg-muted p-3 rounded-lg font-mono text-xs space-y-1">
                      <p className="text-muted-foreground"># Using PowerShell:</p>
                      <div className="flex items-center justify-between group">
                        <p>cd C:\ProgramData\bitwarden\bwdata</p>
                        <CopyButton value="cd C:\ProgramData\bitwarden\bwdata" className="opacity-0 group-hover:opacity-100" />
                      </div>
                      <div className="flex items-center justify-between group">
                        <p>Compress-Archive -Path logs -DestinationPath bitwarden-logs.zip</p>
                        <CopyButton value="Compress-Archive -Path logs -DestinationPath bitwarden-logs.zip" className="opacity-0 group-hover:opacity-100" />
                      </div>
                      <p className="text-muted-foreground mt-2"># Or using Command Prompt with tar (Windows 10+):</p>
                      <div className="flex items-center justify-between group">
                        <p>cd C:\ProgramData\bitwarden\bwdata</p>
                        <CopyButton value="cd C:\ProgramData\bitwarden\bwdata" className="opacity-0 group-hover:opacity-100" />
                      </div>
                      <div className="flex items-center justify-between group">
                        <p>tar -czvf bitwarden-logs.tar.gz logs</p>
                        <CopyButton value="tar -czvf bitwarden-logs.tar.gz logs" className="opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Expected Log Structure</h3>
                    <p className="text-muted-foreground mb-2">
                      The tool works best with logs organized in folders by service:
                    </p>
                    <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                      <p>archive.zip</p>
                      <p className="ml-2">├── service1/</p>
                      <p className="ml-4">│   ├── service1-2024-01-15.log</p>
                      <p className="ml-4">│   └── service1-2024-01-16.log</p>
                      <p className="ml-2">├── service2/</p>
                      <p className="ml-4">│   └── service2-2024-01-15.log</p>
                    </div>
                    <p className="text-muted-foreground mt-2">
                      Log files should contain timestamps in YYYY-MM-DD format for date filtering.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || analyzing}
            >
              Choose file
            </Button>
            <span className="text-sm text-muted-foreground">
              {file ? file.name : 'No file chosen'}
            </span>
            <input
              ref={fileInputRef}
              id="archiveFile"
              type="file"
              accept=".zip,.tar.gz,.tgz,application/gzip,application/x-gzip,application/x-tar"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              className="hidden"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Supported formats: .zip, .tar.gz, .tgz
          </p>
        </div>

        {file && !analysis && (
          <Button
            onClick={handleAnalyze}
            disabled={analyzing}
            variant="secondary"
            className="w-full"
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Analyze Archive
              </>
            )}
          </Button>
        )}

        {progress && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm">{progress}</span>
          </div>
        )}

        {analysis && (
          <>
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-sm">Archive Analysis</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span><strong>{analysis.logFiles}</strong> log files ({analysis.totalFiles} total)</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-muted-foreground" />
                  <span>~<strong>{(analysis.estimatedLogEntries ?? 0).toLocaleString()}</strong> estimated entries</span>
                </div>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span><strong>{analysis.folders.length}</strong> folders</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {analysis.dateRange.earliest && analysis.dateRange.latest ? (
                      <><strong>{analysis.dateRange.earliest}</strong> to <strong>{analysis.dateRange.latest}</strong></>
                    ) : (
                      'No dates found'
                    )}
                  </span>
                </div>
              </div>
              {analysis.folders.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Folders:</p>
                  <div className="flex flex-wrap gap-1">
                    {analysis.folders.slice(0, 10).map((folder) => (
                      <span key={folder} className="px-2 py-0.5 bg-background rounded text-xs">
                        {folder}
                      </span>
                    ))}
                    {analysis.folders.length > 10 && (
                      <span className="px-2 py-0.5 text-xs text-muted-foreground">
                        +{analysis.folders.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Total size: {formatBytes(analysis.totalSize)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">From Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="endDate">To Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Date range auto-populated from archive analysis. Adjust as needed.
            </p>

            <div className="flex gap-2">
              <Button
                onClick={handleExtract}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Extract Logs'
                )}
              </Button>
              <Button
                onClick={handleClear}
                variant="outline"
                disabled={loading || analyzing}
              >
                Clear
              </Button>
            </div>
          </>
        )}

        {file && !analysis && !analyzing && (
          <Button
            onClick={handleClear}
            variant="outline"
          >
            Clear
          </Button>
        )}
          </>
        )}
      </div>

      {logs.length > 0 && <LogTable logs={logs} />}
    </div>
  )
}
