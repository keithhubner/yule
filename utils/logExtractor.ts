import JSZip from 'jszip';
import path from 'path';

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

export async function extractLogsFromZip(zipFile: ArrayBuffer, days: number): Promise<LogEntry[]> {
  const logPattern = /^(\d{4}-\d{2}-\d{2}.*?)\s+(\[(Error|Warning|Critical)\]|ERROR|WARN|CRITICAL).*?/i;
  const logs: LogEntry[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const zip = new JSZip();
  await zip.loadAsync(zipFile);

  for (const [filename, file] of Object.entries(zip.files)) {
    if (!file.dir) {
      const folder = path.dirname(filename);
      const content = await file.async('string');
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
    }
  }

  return logs;
}

