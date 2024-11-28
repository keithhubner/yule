import { NextRequest, NextResponse } from 'next/server'
import { extractLogsFromZip } from '@/utils/logExtractor'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const zipFile = formData.get('zipFile') as File
  const days = parseInt(formData.get('days') as string)

  if (!zipFile || !days) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const arrayBuffer = await zipFile.arrayBuffer()

  try {
    const logs = await extractLogsFromZip(arrayBuffer, days)
    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Error in log extraction:', error)
    return NextResponse.json({ error: 'Failed to extract logs' }, { status: 500 })
  }
}

