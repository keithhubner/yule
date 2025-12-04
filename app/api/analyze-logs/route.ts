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

    // Provide user-friendly error messages for common issues
    let errorMessage = 'Failed to analyze archive'
    if (error instanceof Error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('invalid') || msg.includes('corrupt') || msg.includes('bad')) {
        errorMessage = 'The archive appears to be corrupted or invalid. Please try re-creating the archive.'
      } else if (msg.includes('end of central directory') || msg.includes('zip')) {
        errorMessage = 'The ZIP file is invalid or corrupted. Please ensure it is a valid ZIP archive.'
      } else if (msg.includes('gzip') || msg.includes('gunzip') || msg.includes('decompress')) {
        errorMessage = 'The tar.gz file could not be decompressed. Please ensure it is a valid gzip archive.'
      } else {
        errorMessage = error.message
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
