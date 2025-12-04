import { NextRequest, NextResponse } from 'next/server'
import { extractLogsFromArchive } from '@/utils/logExtractor'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const archiveFile = formData.get('archiveFile') as File
  const daysStr = formData.get('days') as string
  const days = parseInt(daysStr)

  console.log('Received:', {
    hasFile: !!archiveFile,
    fileName: archiveFile?.name,
    fileSize: archiveFile?.size,
    daysStr,
    days
  })

  if (!archiveFile) {
    console.log('Error: No archive file')
    return NextResponse.json({ error: 'Missing archive file' }, { status: 400 })
  }

  if (isNaN(days) || days < 1) {
    console.log('Error: Invalid days value')
    return NextResponse.json({ error: 'Invalid days value' }, { status: 400 })
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

  // Validate days parameter
  const maxDaysLookback = parseInt(process.env.MAX_DAYS_LOOKBACK || '365')
  if (days < 1 || days > maxDaysLookback) {
    return NextResponse.json({
      error: `Days must be between 1 and ${maxDaysLookback}`
    }, { status: 400 })
  }

  console.log('Validation passed, extracting logs...')

  const arrayBuffer = await archiveFile.arrayBuffer()
  console.log('ArrayBuffer size:', arrayBuffer.byteLength)

  try {
    const logs = await extractLogsFromArchive(arrayBuffer, archiveFile.name, days)
    console.log('Extraction complete, found', logs.length, 'logs')
    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Error in log extraction:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to extract logs'
    }, { status: 500 })
  }
}

