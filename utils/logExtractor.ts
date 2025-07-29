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

function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
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

function processLogContent(content: string, filename: string, days: number): LogEntry[] {
  const logPattern = /^(\d{4}-\d{2}-\d{2}.*?)\s+(\[(Error|Warning|Critical)\]|ERROR|WARN|CRITICAL).*?/i;
  const logs: LogEntry[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const folder = normalizeFolderStructure(path.dirname(filename));
  const lines = content.split('\n');
  let currentError: string[] = [];
  let errorStartLine = 0;
  let errorDate: Date | null = null;

  lines.forEach((line, index) => {
    const match = line.match(logPattern);
    if (match) {
      if (currentError.length > 0 && errorDate) {
        const validErrorDate: Date = errorDate;
        if (validErrorDate >= cutoffDate) {
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
    if (validErrorDate >= cutoffDate) {
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

async function extractFromZip(zipFile: ArrayBuffer, days: number): Promise<LogEntry[]> {
  const logs: LogEntry[] = [];
  const zip = new JSZip();
  await zip.loadAsync(zipFile);

  for (const [filename, file] of Object.entries(zip.files)) {
    if (!file.dir && (filename.endsWith('.log') || filename.endsWith('.txt') || !path.extname(filename))) {
      const content = await file.async('string');
      logs.push(...processLogContent(content, filename, days));
    }
  }

  return logs;
}

async function extractFromTarGz(tarGzFile: ArrayBuffer, days: number): Promise<LogEntry[]> {
  return new Promise((resolve, reject) => {
    const logs: LogEntry[] = [];
    const extract = tar.extract();
    
    extract.on('entry', (header, stream, next) => {
      if (header.type === 'file' && 
          (header.name.endsWith('.log') || header.name.endsWith('.txt') || !path.extname(header.name))) {
        let content = '';
        
        stream.on('data', (chunk) => {
          content += chunk.toString();
        });
        
        stream.on('end', () => {
          logs.push(...processLogContent(content, header.name, days));
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

export async function extractLogsFromArchive(archiveFile: ArrayBuffer, filename: string, days: number): Promise<LogEntry[]> {
  const extension = path.extname(filename).toLowerCase();
  
  if (extension === '.zip') {
    return extractFromZip(archiveFile, days);
  } else if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) {
    return extractFromTarGz(archiveFile, days);
  } else {
    throw new Error(`Unsupported file format: ${extension}`);
  }
}

// Keep the old function for backward compatibility
export async function extractLogsFromZip(zipFile: ArrayBuffer, days: number): Promise<LogEntry[]> {
  return extractFromZip(zipFile, days);
}

