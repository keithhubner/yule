import { NextRequest, NextResponse } from 'next/server'
import { analyzeArchive } from '@/utils/logExtractor'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const archiveFile = formData.get('archiveFile') as File

  if (!archiveFile) {
    return NextResponse.json({ error: 'Missing archive file' }, { status: 400 })
  }

  // Validate file size (default max: 100MB, configurable via env)
  const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '100')
  const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024
  if (archiveFile.size > maxFileSizeBytes) {
    return NextResponse.json({
      error: `File size exceeds maximum allowed size of ${maxFileSizeMB}MB`
    }, { status: 413 })
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
    const analysis = await analyzeArchive(arrayBuffer, archiveFile.name)
    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('Error analyzing archive:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to analyze archive'
    }, { status: 500 })
  }
}
