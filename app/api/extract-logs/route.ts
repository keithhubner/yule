import { NextRequest, NextResponse } from 'next/server'
import { extractLogsFromArchive } from '@/utils/logExtractor'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const archiveFile = formData.get('archiveFile') as File
  const startDate = formData.get('startDate') as string | null
  const endDate = formData.get('endDate') as string | null

  console.log('Received:', {
    hasFile: !!archiveFile,
    fileName: archiveFile?.name,
    fileSize: archiveFile?.size,
    startDate,
    endDate
  })

  if (!archiveFile) {
    console.log('Error: No archive file')
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

  // Validate date format if provided
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (startDate && !datePattern.test(startDate)) {
    return NextResponse.json({
      error: 'Invalid start date format. Use YYYY-MM-DD.'
    }, { status: 400 })
  }
  if (endDate && !datePattern.test(endDate)) {
    return NextResponse.json({
      error: 'Invalid end date format. Use YYYY-MM-DD.'
    }, { status: 400 })
  }

  console.log('Validation passed, extracting logs...')

  const arrayBuffer = await archiveFile.arrayBuffer()
  console.log('ArrayBuffer size:', arrayBuffer.byteLength)

  try {
    const logs = await extractLogsFromArchive(arrayBuffer, archiveFile.name, {
      startDate: startDate || null,
      endDate: endDate || null
    })
    console.log('Extraction complete, found', logs.length, 'logs')
    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Error in log extraction:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to extract logs'
    }, { status: 500 })
  }
}
