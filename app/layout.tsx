import './globals.css'
import { ThemeProvider } from "@/components/theme-provider"

export const metadata = {
  title: 'Log Extractor',
  description: 'Extract warnings and errors from log files in a ZIP archive',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}

