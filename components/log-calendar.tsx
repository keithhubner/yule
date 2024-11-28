import React from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { addDays, format, startOfDay } from 'date-fns'

interface LogSummary {
  date: Date
  errors: number
  warnings: number
}

interface LogCalendarProps {
  logSummaries: LogSummary[]
}

export function LogCalendar({ logSummaries }: LogCalendarProps) {
  const today = startOfDay(new Date())
  const calendarDays = Array.from({ length: 30 }, (_, i) => addDays(today, -i))

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-7 gap-2">
          {calendarDays.reverse().map((date) => {
            const summary = logSummaries.find(s => s.date.getTime() === date.getTime())
            return (
              <div
                key={date.toISOString()}
                className={`h-auto p-2 flex flex-col items-center border rounded ${summary ? 'bg-secondary' : 'opacity-50'}`}
              >
                <span className="text-xs font-semibold">{format(date, 'MMM d')}</span>
                {summary && (
                  <>
                    <span className="text-xs text-red-500" aria-label={`${summary.errors} errors`}>
                      {summary.errors}
                    </span>
                    <span className="text-xs text-yellow-500" aria-label={`${summary.warnings} warnings`}>
                      {summary.warnings}
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

