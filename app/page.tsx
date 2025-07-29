'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LogTable } from './log-table'
import { ThemeToggle } from '@/components/theme-toggle'
import { AIConfig } from '@/components/ai-config'
import { Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [days, setDays] = useState(30)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [mounted, setMounted] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

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

      if (!response.ok) throw new Error('Failed to extract logs')

      const data = await response.json()
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

  if (!mounted) {
    return null
  }

  return (
    <main className={`min-h-screen ${theme === 'light' ? 'bg-gradient-to-br from-blue-50 to-gray-100 text-gray-900' : 'bg-gradient-to-br from-gray-900 to-gray-800 text-white'}`}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Log Extractor</h1>
          <div className="flex items-center space-x-2">
            <AIConfig onApiKeyChange={setAiApiKey} />
            <ThemeToggle />
          </div>
        </div>
        <Card className={theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700'}>
          <CardHeader>
            <CardTitle className={`text-2xl ${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`}>Extract Logs</CardTitle>
            <CardDescription className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'}>Upload an archive file (.zip, .tar.gz, .tgz) and specify the number of days to look back</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="zipFile" className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>
                  Archive File (.zip, .tar.gz, .tgz)
                </label>
                <div className="flex items-center space-x-2">
                  <Button
                    type="button"
                    onClick={() => document.getElementById('zipFile')?.click()}
                    className={`${theme === 'light' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                  >
                    Choose file
                  </Button>
                  <span className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>
                    {file ? file.name : 'No file chosen'}
                  </span>
                  <Input
                    id="zipFile"
                    type="file"
                    accept=".zip,.tar.gz,.tgz,application/gzip,application/x-gzip,application/x-tar"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    required
                    className="hidden"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="days" className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>
                  Days to Look Back
                </label>
                <Input
                  id="days"
                  type="number"
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value))}
                  required
                  min="1"
                  className={theme === 'light' ? 'bg-gray-50 border-gray-300 text-gray-900' : 'bg-gray-700 border-gray-600 text-white'}
                />
              </div>
              <div className="flex space-x-2">
                <Button type="submit" disabled={loading} className={`${theme === 'light' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
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
                  type="button" 
                  variant="outline" 
                  onClick={handleClear} 
                  className={`${theme === 'light' ? 'border-gray-300 text-blue-600 hover:bg-gray-100' : 'border-gray-600 text-blue-300 hover:bg-gray-700'} hover:text-white`}
                >
                  Clear
                </Button>
              </div>
            </form>
            {error && <p className="text-red-500 mt-4">{error}</p>}
          </CardContent>
        </Card>
        {logs.length > 0 && <LogTable logs={logs} aiApiKey={aiApiKey} />}
      </div>
    </main>
  )
}

