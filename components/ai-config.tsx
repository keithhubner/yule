'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Settings, Eye, EyeOff } from 'lucide-react'
import { useTheme } from 'next-themes'

interface AIConfigProps {
  onApiKeyChange: (apiKey: string) => void
}

export function AIConfig({ onApiKeyChange }: AIConfigProps) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    setMounted(true)
    // Load API key from session storage on component mount
    const savedApiKey = sessionStorage.getItem('openai-api-key')
    if (savedApiKey) {
      setApiKey(savedApiKey)
      onApiKeyChange(savedApiKey)
    }
  }, [onApiKeyChange])

  const handleSave = () => {
    // Save to session storage
    if (apiKey.trim()) {
      sessionStorage.setItem('openai-api-key', apiKey.trim())
      onApiKeyChange(apiKey.trim())
    } else {
      sessionStorage.removeItem('openai-api-key')
      onApiKeyChange('')
    }
    setIsOpen(false)
  }

  const handleClear = () => {
    setApiKey('')
    sessionStorage.removeItem('openai-api-key')
    onApiKeyChange('')
  }

  const hasApiKey = !!apiKey.trim()

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="relative border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
        title="Configure AI Analysis"
      >
        <Settings className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`relative ${
            theme === 'light' 
              ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-100' 
              : 'border-gray-600 bg-gray-800 text-gray-100 hover:bg-gray-700'
          } ${hasApiKey ? 'ring-2 ring-green-500' : ''}`}
          title="Configure AI Analysis"
        >
          <Settings className="h-[1.2rem] w-[1.2rem]" />
          {hasApiKey && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            AI Configuration
          </DialogTitle>
          <DialogDescription>
            Enter your OpenAI API key to enable AI-powered error analysis. 
            Your key will only be stored in your browser session.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="api-key" className="text-sm font-medium">
              OpenAI API Key
            </label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <p>• Your API key is stored locally in your browser session</p>
            <p>• Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">OpenAI Platform</a></p>
            <p>• AI analysis helps explain error messages and suggest solutions</p>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={!hasApiKey}
          >
            Clear
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}