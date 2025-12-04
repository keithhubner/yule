'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogTable } from './log-table'
import { Loader2, FileText, Search, FolderOpen, Calendar, FileWarning, HelpCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CopyButton } from '@/components/ui/copy-button'

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

  // Auto-populate date range when analysis completes
  useEffect(() => {
    if (analysis?.dateRange.earliest && analysis?.dateRange.latest) {
      setStartDate(analysis.dateRange.earliest)
      setEndDate(analysis.dateRange.latest)
    }
  }, [analysis])

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
    const defaults = getDefaultDateRange()
    setStartDate(defaults.startDate)
    setEndDate(defaults.endDate)
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

      <div className="space-y-4">
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
                  <span>~<strong>{analysis.estimatedLogEntries.toLocaleString()}</strong> estimated entries</span>
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
      </div>

      {logs.length > 0 && <LogTable logs={logs} />}
    </div>
  )
}
