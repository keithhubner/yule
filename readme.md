# Yule Log Tool

## Purpose

Often when investigating software problems you will need to analyze a lot of log files. It can be useful to quickly see where the errors are in these files and also when they happened to get a feel for what may be causing an issue.

> Currently limitations on folder format and log types!

## Disclaimer

This tool was built with a lot of AI assistance and therefore is designed to be used as a reference to build your own version. This tool is not designed to be used in production environments.

## Features

- **Upload Support**: ZIP, tar.gz, and .tgz archives containing log files
- **Local Logs Mode**: Direct access to log files from a mounted directory (no archive needed)
- **Folder Filtering**: Filter logs based on folder/service names
- **Daily Summary**: Interactive graph to visualize and filter logs by day
- **Error Analysis**: AI-powered error analysis using OpenAI (when configured)
- **Type Filtering**: Filter by errors, warnings, or all log types
- **Dark/Light Theme**: Built-in theme switcher
- **Responsive Design**: Works on desktop and mobile devices
- **Security Features**: File size validation, path sanitization, server-side API key storage

## Setup

### Prerequisites

- Node.js 18+ or Docker
- OpenAI API key (optional, for AI analysis feature)

### Environment Configuration

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Configure your environment variables in `.env.local`:
   ```bash
   # Required for AI analysis feature
   OPENAI_API_KEY=your-api-key-here

   # Optional configurations
   OPENAI_MODEL=gpt-3.5-turbo  # or gpt-4
   MAX_FILE_SIZE_MB=100        # Maximum upload size
   MAX_DAYS_LOOKBACK=365       # Maximum days to look back
   LOCAL_LOGS_PATH=/logs       # Path to local logs directory (enables Local Logs mode)
   ```

### Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

4. Build for production:
   ```bash
   npm run build
   npm start
   ```

### Running with Docker (Recommended)

The easiest way to run Yule is with Docker. The image is automatically built and published to GitHub Container Registry.

**Quick start:**

```bash
docker run -d -p 3000:3000 ghcr.io/keithhubner/yule:latest
```

**With AI analysis enabled:**

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=your-api-key \
  ghcr.io/keithhubner/yule:latest
```

**Using a specific version:**

```bash
docker run -d -p 3000:3000 ghcr.io/keithhubner/yule:main
```

**With docker-compose:**

```yaml
version: '3.8'
services:
  yule:
    image: ghcr.io/keithhubner/yule:latest
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=your-api-key  # Optional
      - MAX_FILE_SIZE_MB=100         # Optional
```

Then access the tool at http://localhost:3000

**Available image tags:**
- `latest` - Latest stable release from main branch
- `main` - Latest build from main branch
- `v1.x.x` - Specific version tags

### Running on a Bitwarden Server (Direct Log Access)

You can run Yule directly on your Bitwarden server and mount the logs folder for direct access. When you set the `LOCAL_LOGS_PATH` environment variable, a "Local Logs" mode button appears in the UI, allowing you to browse and analyze logs directly without creating archive files.

> **Security Note:** The volume is mounted as read-only (`:ro`) to ensure Yule cannot modify your log files. The container runs as a non-root user with minimal privileges.

**Linux - Mount Bitwarden logs with Local Logs mode:**

```bash
docker run -d -p 3000:3000 \
  -v /opt/bitwarden/bwdata/logs:/opt/bitwarden/bwdata/logs:ro \
  -e LOCAL_LOGS_PATH=/opt/bitwarden/bwdata/logs \
  --security-opt=no-new-privileges:true \
  --cap-drop=ALL \
  ghcr.io/keithhubner/yule:latest
```

**Windows - Mount Bitwarden logs with Local Logs mode:**

```powershell
docker run -d -p 3000:3000 `
  -v C:\ProgramData\bitwarden\bwdata\logs:C:\ProgramData\bitwarden\bwdata\logs:ro `
  -e LOCAL_LOGS_PATH=C:\ProgramData\bitwarden\bwdata\logs `
  --security-opt=no-new-privileges:true `
  --cap-drop=ALL `
  ghcr.io/keithhubner/yule:latest
```

**Docker Compose with Local Logs mode:**

```yaml
version: '3.8'
services:
  yule:
    image: ghcr.io/keithhubner/yule:latest
    ports:
      - "3000:3000"
    volumes:
      - /opt/bitwarden/bwdata/logs:/opt/bitwarden/bwdata/logs:ro  # Read-only mount
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    environment:
      - LOCAL_LOGS_PATH=/opt/bitwarden/bwdata/logs  # Enables Local Logs mode in UI
      - OPENAI_API_KEY=your-api-key                 # Optional
```

With Local Logs mode enabled, the UI shows two buttons: "Upload Archive" and "Local Logs". In Local Logs mode, you can select specific service folders to analyze and filter by date range - no need to create zip files.

**Security features when running on production servers:**
- `:ro` - Read-only volume mount (cannot modify your logs)
- `--security-opt=no-new-privileges:true` - Prevents privilege escalation
- `--cap-drop=ALL` - Drops all Linux capabilities
- Runs as non-root user (UID 1001)
- Container has no access to host network or other containers

## Preparing Log Files

### Bitwarden Self-Hosted Logs

#### Linux Server

Bitwarden logs are typically located in `/opt/bitwarden/bwdata/logs/`. To create a zip archive:

```bash
# Navigate to the Bitwarden data directory
cd /opt/bitwarden/bwdata

# Create a zip archive of all logs
zip -r bitwarden-logs.zip logs/

# Or create a tar.gz archive
tar -czvf bitwarden-logs.tar.gz logs/
```

#### Windows Server

Bitwarden logs are typically located in `C:\ProgramData\bitwarden\bwdata\logs\`. To create a zip archive:

**Using PowerShell:**
```powershell
# Navigate to the Bitwarden data directory
cd C:\ProgramData\bitwarden\bwdata

# Create a zip archive of all logs
Compress-Archive -Path logs -DestinationPath bitwarden-logs.zip
```

**Using Command Prompt with tar (Windows 10+):**
```cmd
cd C:\ProgramData\bitwarden\bwdata
tar -czvf bitwarden-logs.tar.gz logs
```

### Other Log Sources

The tool works with any logs in the following structure:
```
archive.zip
├── service1/
│   ├── service1-2024-01-15.log
│   └── service1-2024-01-16.log
├── service2/
│   └── service2-2024-01-15.log
```

Log files should contain timestamps in `YYYY-MM-DD` format for date filtering to work correctly.

## Using the Tool

### Archive Mode (Default)
1. **Upload Archive**: Click "Choose file" and select a .zip, .tar.gz, or .tgz file (click the ? icon for help creating archives)
2. **Analyze Archive**: Click "Analyze Archive" to preview the contents - shows file count, estimated log entries, folders, and date range
3. **Set Date Range**: The date range auto-populates from the archive analysis - adjust as needed
4. **Extract Logs**: Click "Extract Logs" to process and display the log entries

### Local Logs Mode (when LOCAL_LOGS_PATH is configured)
1. **Switch Mode**: Click "Local Logs" button to switch from archive upload mode
2. **Select Folders**: Click on service folders to select which logs to analyze (use "Select All" for all folders)
3. **Set Date Range**: Adjust the date range to filter log entries
4. **Extract Logs**: Click "Extract Logs" to process and display entries from selected folders

### Common Features
- **Filter by Folder**: Click folder cards to filter logs by service/component
- **Filter by Date**: Click bars in the daily summary chart to filter by specific dates
- **AI Analysis**: Click the brain icon next to any log entry to get AI-powered insights (requires OpenAI API key)
- **Copy Logs**: Use the copy button to copy log content to clipboard

## Architecture

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Archive Processing**: JSZip (ZIP), tar-stream + pako (tar.gz/tgz)
- **Charts**: Recharts
- **AI**: OpenAI API (GPT-3.5/4)

## Security Features

- Server-side API key storage (never exposed to client)
- File size validation (default: 100MB max)
- Path sanitization to prevent directory traversal
- Input validation for all user inputs
- Days lookback limit (default: 365 max)

## Recent Improvements

### Security
- Moved OpenAI API key to server-side environment variables
- Added file size validation on both client and server
- Implemented path sanitization to prevent directory traversal attacks
- Added comprehensive input validation

### Performance
- Optimized log filtering with early returns and cached lowercase checks
- Improved folder and daily summaries calculation (single-pass processing)
- Updated TypeScript target from ES5 to ES2017 for better performance

### Code Quality
- Added proper TypeScript types throughout
- Created ESLint configuration with Next.js rules
- Removed unused components (LogCalendar)
- Added .env.example for configuration documentation

### Developer Experience
- Created comprehensive .env.example file
- Added ESLint for code quality
- Improved error messages
- Better code organization

## Development

### Running Linter

```bash
npm run lint
```

### Type Checking

```bash
npx tsc --noEmit
```

## Known Limitations

- Log pattern recognition is limited to specific date formats (YYYY-MM-DD)
- Large archives (>100MB) may cause memory issues
- AI analysis requires OpenAI API key and incurs API costs
- Limited to error/warning detection based on keyword matching

## Future Enhancements

- [ ] Add support for custom log patterns
- [ ] Implement streaming for large file processing
- [ ] Add export functionality for filtered results
- [ ] Cache AI analysis results
- [ ] Add keyboard navigation support
- [ ] Improve accessibility with ARIA labels
- [ ] Add unit tests for critical functions
- [ ] Support for more archive formats

## Contributing

This is a reference implementation. Feel free to fork and customize for your needs.

