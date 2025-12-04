import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Log Extractor',
  description: 'Extract warnings and errors from log files in a ZIP archive',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
