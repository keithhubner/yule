import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CopyButton } from "@/components/ui/copy-button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"

interface Log {
  folder: string;
  file: string;
  lineNumber: number;
  content: string;
  date: Date;
}

interface LogTableProps {
  logs: Log[]
}

interface FolderSummary {
  folderName: string;
  errors: number;
  warnings: number;
}

interface DailySummary {
  date: string;
  errors: number;
  warnings: number;
}

const MAX_PREVIEW_LINES = 3;
const LOGS_PER_PAGE = 20;

export function LogTable({ logs }: LogTableProps) {
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState('all')
  const [expandedLogs, setExpandedLogs] = useState<number[]>([])
  const { theme } = useTheme()
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartHeight, setChartHeight] = useState(400)
  const [visibleLogs, setVisibleLogs] = useState<Log[]>([])
  const [page, setPage] = useState(1)
  const loaderRef = useRef(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const getLastPathSegment = (path: string) => {
    const segments = path.split('/');
    return segments[segments.length - 1];
  };

  const uniqueFolders = useMemo(() => {
    return Array.from(new Set(logs.map(log => getLastPathSegment(log.folder))))
  }, [logs])

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesFolder = selectedFolders.length === 0 || selectedFolders.includes(getLastPathSegment(log.folder))
      const matchesType = typeFilter === 'all' || 
        (typeFilter === 'error' && log.content.toLowerCase().includes('error')) ||
        (typeFilter === 'warning' && log.content.toLowerCase().includes('warn'))
      const matchesDate = !selectedDate || new Date(log.date).toISOString().split('T')[0] === selectedDate
      return matchesFolder && matchesType && matchesDate
    })
  }, [logs, selectedFolders, typeFilter, selectedDate])

  const folderSummaries = useMemo(() => {
    const summaries: FolderSummary[] = uniqueFolders.map(folderName => {
      const folderLogs = filteredLogs.filter(log => getLastPathSegment(log.folder) === folderName)
      return {
        folderName,
        errors: folderLogs.filter(log => log.content.toLowerCase().includes('error')).length,
        warnings: folderLogs.filter(log => log.content.toLowerCase().includes('warn')).length,
      }
    })
    return summaries
  }, [filteredLogs, uniqueFolders])

  const dailySummaries = useMemo(() => {
    const summaries: { [key: string]: DailySummary } = {};
    filteredLogs.forEach(log => {
      const date = new Date(log.date).toISOString().split('T')[0];
      if (!summaries[date]) {
        summaries[date] = { date, errors: 0, warnings: 0 };
      }
      if (log.content.toLowerCase().includes('error')) {
        summaries[date].errors++;
      }
      if (log.content.toLowerCase().includes('warn')) {
        summaries[date].warnings++;
      }
    });
    return Object.values(summaries).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredLogs]);

  const toggleFolder = (folderName: string) => {
    setSelectedFolders(prev => 
      prev.includes(folderName)
        ? prev.filter(f => f !== folderName)
        : [...prev, folderName]
    )
    setPage(1)
    setVisibleLogs([])
  }

  const toggleExpand = (index: number) => {
    setExpandedLogs(prev => 
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  const renderLogContent = (content: string, index: number) => {
    const lines = content.split('\n');
    const isExpanded = expandedLogs.includes(index);
    const displayLines = isExpanded ? lines : lines.slice(0, MAX_PREVIEW_LINES);
    const hasMoreLines = lines.length > MAX_PREVIEW_LINES;

    return (
      <>
        <pre className="whitespace-pre-wrap break-words">
          <code className={`${content.toLowerCase().includes('error') ? 'text-red-500' : 
                          content.toLowerCase().includes('warn') ? 'text-yellow-600' : ''}`}>
            {displayLines.join('\n')}
          </code>
        </pre>
        {hasMoreLines && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleExpand(index)}
            className={`mt-2 ${theme === 'light' ? 'text-blue-600 hover:text-blue-700' : 'text-blue-400 hover:text-blue-300'}`}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="mr-2 h-4 w-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="mr-2 h-4 w-4" />
                Show More
              </>
            )}
          </Button>
        )}
      </>
    );
  };

  const loadMoreLogs = useCallback(() => {
    const nextLogs = filteredLogs.slice(visibleLogs.length, visibleLogs.length + LOGS_PER_PAGE);
    setVisibleLogs(prev => [...prev, ...nextLogs]);
    setPage(prev => prev + 1);
  }, [filteredLogs, visibleLogs]);

  useEffect(() => {
    setPage(1);
    setVisibleLogs(filteredLogs.slice(0, LOGS_PER_PAGE));
  }, [filteredLogs]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && visibleLogs.length < filteredLogs.length) {
          loadMoreLogs();
        }
      },
      { threshold: 1.0 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [visibleLogs, filteredLogs, loadMoreLogs]);

  useEffect(() => {
    const updateHeight = () => {
      if (chartRef.current) {
        const newHeight = chartRef.current.scrollHeight
        setChartHeight(newHeight)
      }
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [dailySummaries])

  const handleBarClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const clickedDate = data.activePayload[0].payload.date;
      if (selectedDate === clickedDate) {
        setSelectedDate(null);
      } else {
        setSelectedDate(clickedDate);
      }
      setPage(1);
      setVisibleLogs([]);
    }
  };

  return (
    <div className="mt-8 space-y-8">
      <h2 className={`text-2xl font-bold ${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`}>Extracted Logs</h2>
      
      <Card className={`w-full ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700'}`}>
        <CardHeader>
          <CardTitle className={`text-xl ${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`}>Folder Summary (Click to filter)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {folderSummaries.map((summary) => (
              <Button
                key={summary.folderName}
                variant={selectedFolders.includes(summary.folderName) ? "default" : "outline"}
                className={`p-4 h-auto flex flex-col items-start ${
                  selectedFolders.includes(summary.folderName) 
                    ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                    : theme === 'light'
                      ? 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-800'
                      : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200'
                }`}
                onClick={() => toggleFolder(summary.folderName)}
              >
                <h3 className="font-semibold mb-2 text-left">{summary.folderName}</h3>
                <p>
                  <span className={`${theme === 'light' ? 'text-red-600' : 'text-red-400'} font-medium mr-2`}>
                    Errors: {summary.errors}
                  </span>
                  <span className={`${theme === 'light' ? 'text-yellow-600' : 'text-yellow-400'} font-medium`}>
                    Warnings: {summary.warnings}
                  </span>
                </p>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className={`w-full mt-4 relative z-10 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-gray-800 border-gray-700'}`}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className={`text-xl ${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`}>
            Daily Error and Warning Summary
            {selectedDate && (
              <span className="ml-2 text-sm font-normal">
                (Filtered: {new Date(selectedDate).toLocaleDateString()})
              </span>
            )}
          </CardTitle>
          {selectedDate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDate(null);
                setPage(1);
                setVisibleLogs([]);
              }}
            >
              Clear Date Filter
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-4 pb-8">
          <div className="w-full" style={{ height: '500px' }}>
            <ChartContainer
              config={{
                errors: {
                  label: "Errors",
                  color: "rgb(248 113 113)", // red-400
                },
                warnings: {
                  label: "Warnings",
                  color: "rgb(250 204 21)", // yellow-400
                },
              }}
              className="h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={dailySummaries} 
                  margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
                  onClick={handleBarClick}
                >
                  <XAxis 
                    dataKey="date" 
                    stroke={theme === 'light' ? '#374151' : '#9CA3AF'}
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    tickMargin={30}
                  />
                  <YAxis 
                    stroke={theme === 'light' ? '#374151' : '#9CA3AF'}
                    tickMargin={8}
                  />
                  <Tooltip 
                    content={<ChartTooltipContent />}
                    cursor={{ fill: theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }}
                  />
                  <Bar dataKey="errors" stackId="a" radius={[4, 4, 0, 0]}>
                    {dailySummaries.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={selectedDate === entry.date ? 'rgb(239 68 68)' : 'rgb(248 113 113)'} // red-600 : red-400
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="warnings" stackId="a" radius={[4, 4, 0, 0]}>
                    {dailySummaries.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={selectedDate === entry.date ? 'rgb(202 138 4)' : 'rgb(250 204 21)'} // yellow-600 : yellow-400
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Select onValueChange={(value) => { setTypeFilter(value); setPage(1); setVisibleLogs([]); }} value={typeFilter}>
          <SelectTrigger className={`w-[180px] ${theme === 'light' ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-700 border-gray-600 text-white'}`}>
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent className={theme === 'light' ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-700 border-gray-600 text-white'}>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="warning">Warnings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className={`rounded-md border mt-8 relative z-0 ${theme === 'light' ? 'border-gray-300' : 'border-gray-700'}`}>
        <div className="w-full">
          <Table className="w-full">
            <TableHeader className={`flex ${theme === 'light' ? 'bg-gray-100' : 'bg-gray-800'}`}>
              <TableRow className="flex w-full">
                <TableHead className={`flex-none ${theme === 'light' ? 'text-gray-700 font-semibold' : 'text-gray-300'} w-52`}>Date</TableHead>
                <TableHead className={`flex-none ${theme === 'light' ? 'text-gray-700 font-semibold' : 'text-gray-300'} w-32`}>Folder</TableHead>
                <TableHead className={`flex-none ${theme === 'light' ? 'text-gray-700 font-semibold' : 'text-gray-300'} w-32`}>File</TableHead>
                <TableHead className={`flex-none ${theme === 'light' ? 'text-gray-700 font-semibold' : 'text-gray-300'} w-20`}>Line</TableHead>
                <TableHead className={`flex-1 ${theme === 'light' ? 'text-gray-700 font-semibold' : 'text-gray-300'}`}>Content</TableHead>
                <TableHead className={`flex-none ${theme === 'light' ? 'text-gray-700 font-semibold' : 'text-gray-300'} w-20 text-center`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="flex flex-col">
              {visibleLogs.map((log, index) => (
                <TableRow key={index} className={`flex w-full ${theme === 'light' ? 'even:bg-gray-50' : 'even:bg-gray-800'} hover:bg-gray-100 dark:hover:bg-gray-700`}>
                  <TableCell className={`flex-none ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} w-52`}>
                    {new Date(log.date).toLocaleString()}
                  </TableCell>
                  <TableCell className={`flex-none font-medium ${theme === 'light' ? 'text-gray-900' : 'text-gray-300'} w-32 truncate`}>
                    {getLastPathSegment(log.folder)}
                  </TableCell>
                  <TableCell className={`flex-none ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} w-32 truncate`}>
                    {getLastPathSegment(log.file)}
                  </TableCell>
                  <TableCell className={`flex-none ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'} w-20 text-center`}>
                    {log.lineNumber}
                  </TableCell>
                  <TableCell className={`flex-1 ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>
                    {renderLogContent(log.content, index)}
                  </TableCell>
                  <TableCell className="flex-none w-20 flex justify-center items-center">
                    <CopyButton 
                      value={log.content} 
                      className={`transition-colors ${
                        theme === 'light' 
                          ? 'text-gray-600 hover:text-blue-600' 
                          : 'text-white hover:text-blue-400'
                      }`} 
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {visibleLogs.length < filteredLogs.length && (
            <div ref={loaderRef} className="flex justify-center items-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LogTable;

