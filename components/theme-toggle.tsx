"use client"

import * as React from "react"
import { Moon, Sun } from 'lucide-react'
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false)
  const { setTheme, theme } = useTheme()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="relative border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
      >
        <Sun className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className={`relative ${
        theme === 'light' 
          ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-100' 
          : 'border-gray-600 bg-gray-800 text-gray-100 hover:bg-gray-700'
      }`}
    >
      {theme === "light" ? (
        <Moon className="h-[1.2rem] w-[1.2rem]" />
      ) : (
        <Sun className="h-[1.2rem] w-[1.2rem] text-yellow-400" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

