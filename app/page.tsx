'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogTable } from './log-table'
import { Loader2, FileText } from 'lucide-react'

interface Log {
  folder: string
  file: string
  lineNumber: number
  content: string
  date: Date
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [days, setDays] = useState(30)
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select an archive file')
      return
    }

    // Validate file type
    const supportedTypes = ['.zip', '.tar.gz', '.tgz']
    const isSupported = supportedTypes.some(type =>
      file.name.toLowerCase().endsWith(type)
    )

    if (!isSupported) {
      setError('Please select a .zip, .tar.gz, or .tgz file')
      return
    }

    // Validate file size (default max: 100MB)
    const maxFileSizeMB = 100
    const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024
    if (file.size > maxFileSizeBytes) {
      setError(`File size exceeds maximum allowed size of ${maxFileSizeMB}MB`)
      return
    }
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('archiveFile', file)
      formData.append('days', days.toString())

      const response = await fetch('/api/extract-logs', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract logs')
      }

      setLogs(data.logs)
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unknown error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setFile(null)
    setDays(30)
    setLogs([])
    setError('')
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
            <Label htmlFor="archiveFile">Archive File</Label>
            <div className="flex items-center gap-2 mt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('archiveFile')?.click()}
              >
                Choose file
              </Button>
              <span className="text-sm text-muted-foreground">
                {file ? file.name : 'No file chosen'}
              </span>
              <input
                id="archiveFile"
                type="file"
                accept=".zip,.tar.gz,.tgz,application/gzip,application/x-gzip,application/x-tar"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Supported formats: .zip, .tar.gz, .tgz
            </p>
          </div>

          <div>
            <Label htmlFor="days">Days to Look Back</Label>
            <Input
              id="days"
              type="number"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              min="1"
              max="365"
            />
            <p className="text-sm text-muted-foreground">
              Enter a value between 1 and 365 days
            </p>
          </div>

          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              'Extract Logs'
            )}
          </Button>
        </div>

        {logs.length > 0 && <LogTable logs={logs} />}
    </div>
  )
}
