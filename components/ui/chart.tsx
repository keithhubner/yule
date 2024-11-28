import React from 'react'
import { TooltipProps } from 'recharts'

interface ChartContainerProps {
  children: React.ReactNode
  config: Record<string, { label: string; color: string }>
  className?: string
}

export function ChartContainer({ children, config, className }: ChartContainerProps) {
  return (
    <div className={className} style={Object.fromEntries(Object.entries(config).map(([key, value]) => [`--color-${key}`, value.color]))}>
      {children}
    </div>
  )
}

export function ChartTooltipContent({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload) return null

  return (
    <div className="bg-white p-2 border border-gray-200 rounded shadow">
      <p className="font-semibold">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  )
}
