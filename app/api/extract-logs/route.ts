import { NextRequest, NextResponse } from 'next/server'
import { extractLogsFromArchive } from '@/utils/logExtractor'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const archiveFile = formData.get('archiveFile') as File
  const days = parseInt(formData.get('days') as string)

  if (!archiveFile || !days) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate file type
  const supportedTypes = ['.zip', '.tar.gz', '.tgz']
  const isSupported = supportedTypes.some(type => 
    archiveFile.name.toLowerCase().endsWith(type)
  )
  
  if (!isSupported) {
    return NextResponse.json({ 
      error: 'Unsupported file type. Please upload a .zip, .tar.gz, or .tgz file.' 
    }, { status: 400 })
  }

  const arrayBuffer = await archiveFile.arrayBuffer()

  try {
    const logs = await extractLogsFromArchive(arrayBuffer, archiveFile.name, days)
    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Error in log extraction:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to extract logs' 
    }, { status: 500 })
  }
}

