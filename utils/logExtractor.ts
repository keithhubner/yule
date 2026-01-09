import JSZip from 'jszip';
import path from 'path';
import * as tar from 'tar-stream';
import * as pako from 'pako';

interface LogEntry {
  folder: string;
  file: string;
  lineNumber: number;
  content: string;
  date: Date;
}

export interface ArchiveAnalysis {
  totalFiles: number;
  logFiles: number;
  totalSize: number;
  folders: string[];
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
  estimatedLogEntries: number;
}

function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Sanitize file path to prevent directory traversal attacks
 * Returns null if path is potentially malicious
 */
function sanitizePath(filePath: string): string | null {
  // Remove any leading slashes
  let sanitized = filePath.replace(/^\/+/, '');

  // Check for directory traversal attempts
  if (sanitized.includes('..') || sanitized.includes('~')) {
    return null;
  }

  // Normalize the path
  sanitized = path.normalize(sanitized);

  // Double check after normalization
  if (sanitized.includes('..') || sanitized.startsWith('/')) {
    return null;
  }

  return sanitized;
}

function normalizeFolderStructure(filePath: string): string {
  // Remove common prefixes and normalize folder names
  const segments = filePath.split('/');
  
  // Remove empty segments and common patterns
  const cleanSegments = segments.filter(segment => 
    segment && 
    segment !== '.' && 
    !segment.startsWith('__') &&
    !segment.match(/^\d{4}-\d{2}-\d{2}/) // Remove date-based folders
  );
  
  // If we have multiple segments, preserve the meaningful hierarchy
  if (cleanSegments.length > 1) {
    // Look for service/application names (usually not 'logs', 'var', 'tmp', etc.)
    const meaningfulSegments = cleanSegments.filter(segment => 
      !['logs', 'log', 'var', 'tmp', 'data', 'output'].includes(segment.toLowerCase())
    );
    
    if (meaningfulSegments.length > 1) {
      // Return parent/child format for better container identification
      return meaningfulSegments.slice(0, 2).join('/');
    } else if (meaningfulSegments.length > 0) {
      // If only one meaningful segment, check if there are other segments to combine
      const remainingSegments = cleanSegments.filter(segment => 
        !meaningfulSegments.includes(segment) && 
        !['logs', 'log', 'var', 'tmp', 'data', 'output'].includes(segment.toLowerCase())
      );
      if (remainingSegments.length > 0) {
        return `${meaningfulSegments[0]}/${remainingSegments[0]}`;
      }
      return meaningfulSegments[0];
    }
  }
  
  return cleanSegments.length > 1 ? cleanSegments.slice(0, 2).join('/') : (cleanSegments[0] || 'root');
}

interface DateRange {
  startDate: string | null;  // YYYY-MM-DD format
  endDate: string | null;    // YYYY-MM-DD format
}

function processLogContent(content: string, filename: string, dateRange: DateRange): LogEntry[] {
  // Match various log formats:
  // - [Error], [Warning], [Critical] - full names
  // - [ERR], [WRN], [CRIT], [FTL] - abbreviated
  // - ERROR, WARN, CRITICAL - uppercase without brackets
  const logPattern = /^(\d{4}-\d{2}-\d{2}.*?)\s+(\[(Error|Warning|Critical|ERR|WRN|CRIT|FTL|FAT)\]|ERROR|WARN|CRITICAL|FATAL)/i;
  const logs: LogEntry[] = [];

  // Parse date range
  const startDate = dateRange.startDate ? new Date(dateRange.startDate) : null;
  const endDate = dateRange.endDate ? new Date(dateRange.endDate + 'T23:59:59') : null;

  const folder = normalizeFolderStructure(path.dirname(filename));
  const lines = content.split('\n');
  let currentError: string[] = [];
  let errorStartLine = 0;
  let errorDate: Date | null = null;

  const isInDateRange = (date: Date): boolean => {
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  };

  lines.forEach((line, index) => {
    const match = line.match(logPattern);
    if (match) {
      if (currentError.length > 0 && errorDate) {
        const validErrorDate: Date = errorDate;
        if (isInDateRange(validErrorDate)) {
          logs.push({
            folder,
            file: filename,
            lineNumber: errorStartLine + 1,
            content: currentError.join('\n').trim(),
            date: validErrorDate,
          });
        }
        currentError = [];
        errorDate = null;
      }
      errorStartLine = index;
      currentError.push(line.trim());
      const parsedDate = new Date(match[1]);
      if (isValidDate(parsedDate)) {
        errorDate = parsedDate;
      }
    } else if (currentError.length > 0) {
      currentError.push(line.trim());
    }
  });

  if (currentError.length > 0 && errorDate) {
    const validErrorDate: Date = errorDate;
    if (isInDateRange(validErrorDate)) {
      logs.push({
        folder,
        file: filename,
        lineNumber: errorStartLine + 1,
        content: currentError.join('\n').trim(),
        date: validErrorDate,
      });
    }
  }
  
  return logs;
}

async function extractFromZip(zipFile: ArrayBuffer, dateRange: DateRange): Promise<LogEntry[]> {
  const logs: LogEntry[] = [];
  const zip = new JSZip();
  await zip.loadAsync(zipFile);

  let sampleLogged = false;
  for (const [filename, file] of Object.entries(zip.files)) {
    // Sanitize the file path
    const sanitizedPath = sanitizePath(filename);
    if (!sanitizedPath) {
      console.warn(`Skipping potentially malicious path: ${filename}`);
      continue;
    }

    if (!file.dir && (sanitizedPath.endsWith('.log') || sanitizedPath.endsWith('.txt') || !path.extname(sanitizedPath))) {
      const content = await file.async('string');

      // Debug: Log sample of first log file to understand format
      if (!sampleLogged && content.length > 0) {
        console.log('=== DEBUG: Sample log file ===');
        console.log('File:', sanitizedPath);
        console.log('First 10 lines:');
        const sampleLines = content.split('\n').slice(0, 10);
        sampleLines.forEach((line, i) => console.log(`  ${i + 1}: ${line.substring(0, 200)}`));
        console.log('==============================');
        sampleLogged = true;
      }

      logs.push(...processLogContent(content, sanitizedPath, dateRange));
    }
  }

  return logs;
}

async function extractFromTarGz(tarGzFile: ArrayBuffer, dateRange: DateRange): Promise<LogEntry[]> {
  return new Promise((resolve, reject) => {
    const logs: LogEntry[] = [];
    const extract = tar.extract();

    extract.on('entry', (header, stream, next) => {
      // Sanitize the file path
      const sanitizedPath = sanitizePath(header.name);

      if (!sanitizedPath) {
        console.warn(`Skipping potentially malicious path: ${header.name}`);
        stream.on('end', () => next());
        stream.resume();
        return;
      }

      if (header.type === 'file' &&
          (sanitizedPath.endsWith('.log') || sanitizedPath.endsWith('.txt') || !path.extname(sanitizedPath))) {
        let content = '';

        stream.on('data', (chunk) => {
          content += chunk.toString();
        });

        stream.on('end', () => {
          logs.push(...processLogContent(content, sanitizedPath, dateRange));
          next();
        });

        stream.resume();
      } else {
        stream.on('end', () => next());
        stream.resume();
      }
    });
    
    extract.on('finish', () => {
      resolve(logs);
    });
    
    extract.on('error', (err) => {
      reject(err);
    });
    
    try {
      // Decompress gzip data
      const decompressed = pako.ungzip(new Uint8Array(tarGzFile));
      extract.end(Buffer.from(decompressed));
    } catch (error) {
      reject(error);
    }
  });
}

export async function extractLogsFromArchive(
  archiveFile: ArrayBuffer,
  filename: string,
  dateRange: { startDate: string | null; endDate: string | null }
): Promise<LogEntry[]> {
  const extension = path.extname(filename).toLowerCase();

  if (extension === '.zip') {
    return extractFromZip(archiveFile, dateRange);
  } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
    return extractFromTarGz(archiveFile, dateRange);
  } else {
    throw new Error(`Unsupported file format: ${extension}`);
  }
}

// Keep the old function for backward compatibility (converts days to date range)
export async function extractLogsFromZip(zipFile: ArrayBuffer, days: number): Promise<LogEntry[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return extractFromZip(zipFile, {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  });
}

// Quick analysis functions for preview
async function analyzeZip(zipFile: ArrayBuffer): Promise<ArchiveAnalysis> {
  const zip = new JSZip();
  await zip.loadAsync(zipFile);

  const folders = new Set<string>();
  const dates: Date[] = [];
  let totalFiles = 0;
  let logFiles = 0;
  let totalSize = 0;
  let estimatedLogEntries = 0;

  const datePattern = /\d{4}-\d{2}-\d{2}/;
  const logPattern = /\[(Error|Warning|Critical|ERR|WRN|CRIT|FTL|FAT)\]|ERROR|WARN|CRITICAL|FATAL/i;

  for (const [filename, file] of Object.entries(zip.files)) {
    const sanitizedPath = sanitizePath(filename);
    if (!sanitizedPath || file.dir) continue;

    totalFiles++;

    if (sanitizedPath.endsWith('.log') || sanitizedPath.endsWith('.txt') || !path.extname(sanitizedPath)) {
      logFiles++;
      const folder = normalizeFolderStructure(path.dirname(sanitizedPath));
      folders.add(folder);

      // Get file size
      const content = await file.async('string');
      totalSize += content.length;

      // Sample first 100 lines for date range and log entry estimation
      const lines = content.split('\n').slice(0, 100);
      for (const line of lines) {
        const dateMatch = line.match(datePattern);
        if (dateMatch) {
          const date = new Date(dateMatch[0]);
          if (isValidDate(date)) {
            dates.push(date);
          }
        }
        if (logPattern.test(line)) {
          estimatedLogEntries++;
        }
      }

      // Estimate total log entries based on sample
      const totalLines = content.split('\n').length;
      if (lines.length > 0) {
        const ratio = totalLines / lines.length;
        estimatedLogEntries = Math.floor(estimatedLogEntries * ratio);
      }
    }
  }

  // Sort dates to get range
  dates.sort((a, b) => a.getTime() - b.getTime());

  return {
    totalFiles,
    logFiles,
    totalSize,
    folders: Array.from(folders).sort(),
    dateRange: {
      earliest: dates.length > 0 ? dates[0].toISOString().split('T')[0] : null,
      latest: dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : null,
    },
    estimatedLogEntries,
  };
}

async function analyzeTarGz(tarGzFile: ArrayBuffer): Promise<ArchiveAnalysis> {
  return new Promise((resolve, reject) => {
    const folders = new Set<string>();
    const dates: Date[] = [];
    let totalFiles = 0;
    let logFiles = 0;
    let totalSize = 0;
    let estimatedLogEntries = 0;

    const datePattern = /\d{4}-\d{2}-\d{2}/;
    const logPattern = /\[(Error|Warning|Critical|ERR|WRN|CRIT|FTL|FAT)\]|ERROR|WARN|CRITICAL|FATAL/i;

    const extract = tar.extract();

    extract.on('entry', (header, stream, next) => {
      const sanitizedPath = sanitizePath(header.name);

      if (!sanitizedPath) {
        stream.on('end', () => next());
        stream.resume();
        return;
      }

      if (header.type === 'file') {
        totalFiles++;

        if (sanitizedPath.endsWith('.log') || sanitizedPath.endsWith('.txt') || !path.extname(sanitizedPath)) {
          logFiles++;
          const folder = normalizeFolderStructure(path.dirname(sanitizedPath));
          folders.add(folder);

          let content = '';
          stream.on('data', (chunk) => {
            content += chunk.toString();
          });

          stream.on('end', () => {
            totalSize += content.length;

            // Sample first 100 lines
            const lines = content.split('\n').slice(0, 100);
            let sampleEntries = 0;
            for (const line of lines) {
              const dateMatch = line.match(datePattern);
              if (dateMatch) {
                const date = new Date(dateMatch[0]);
                if (isValidDate(date)) {
                  dates.push(date);
                }
              }
              if (logPattern.test(line)) {
                sampleEntries++;
              }
            }

            // Estimate total based on sample
            const totalLines = content.split('\n').length;
            if (lines.length > 0) {
              const ratio = totalLines / lines.length;
              estimatedLogEntries += Math.floor(sampleEntries * ratio);
            }

            next();
          });

          stream.resume();
        } else {
          stream.on('end', () => next());
          stream.resume();
        }
      } else {
        stream.on('end', () => next());
        stream.resume();
      }
    });

    extract.on('finish', () => {
      dates.sort((a, b) => a.getTime() - b.getTime());

      resolve({
        totalFiles,
        logFiles,
        totalSize,
        folders: Array.from(folders).sort(),
        dateRange: {
          earliest: dates.length > 0 ? dates[0].toISOString().split('T')[0] : null,
          latest: dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : null,
        },
        estimatedLogEntries,
      });
    });

    extract.on('error', (err) => {
      reject(err);
    });

    try {
      const decompressed = pako.ungzip(new Uint8Array(tarGzFile));
      extract.end(Buffer.from(decompressed));
    } catch (error) {
      reject(error);
    }
  });
}

export async function analyzeArchive(archiveFile: ArrayBuffer, filename: string): Promise<ArchiveAnalysis> {
  const extension = path.extname(filename).toLowerCase();

  if (extension === '.zip') {
    return analyzeZip(archiveFile);
  } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
    return analyzeTarGz(archiveFile);
  } else {
    throw new Error(`Unsupported file format: ${extension}`);
  }
}

