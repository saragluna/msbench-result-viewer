# Request Viewer with Python Web Server

This is an enhanced Request Viewer that uses a Python web server to provide real directory scanning capabilities for finding `sim-requests-*.txt` files across complex directory structures.

## Features

- **Real Directory Scanning**: Uses Python to actually scan the file system (not limited by browser security)
- **Smart Path Recognition**: Automatically extracts run IDs and instance names from complex directory structures
- **User-Friendly Display**: Shows files as "run_id/instance" format for easy identification
- **CORS Support**: Proper handling of cross-origin requests for local development
- **Error Handling**: Clear error messages and fallback options

## Quick Start


You could store all your msbench-cli run results under a folder, and each time under that folder run the download command `msbench-cli extract --run_id 16456557241 --output ./16456557241`. And then paste the root folder to the web page, select the instance, then check the result.

1. **Start the Python web server:**
   ```bash
   python3 web_server.py
   ```
   
   The server will start on `http://localhost:8000` by default.

2. **Open the web interface:**
   Navigate to `http://localhost:8000/request-viewer.html` in your browser.

3. **Scan for files:**
   - Leave the "Root Folder Path" empty to scan the current directory
   - Or enter a specific path like `/path/to/your/evaluation/runs`
   - Click "Scan Folder" to find all sim-requests files

## Command Line Options

```bash
python3 web_server.py --help
```

Available options:
- `--port`, `-p`: Port number (default: 8000)
- `--host`: Host to bind to (default: localhost)
- `--directory`, `-d`: Directory to serve files from (default: current directory)

Examples:
```bash
# Run on a different port
python3 web_server.py --port 9000

# Allow access from other machines
python3 web_server.py --host 0.0.0.0

# Serve from a specific directory
python3 web_server.py --directory /path/to/evaluation/runs
```

## Directory Structure Support

The server recognizes these common path patterns:

1. **Standard evaluation structure:**
   ```
   runId/javamigration.eval.x86_64.instance-output/output/sim-output/-conversation-panel-instance/sim-requests-0.txt
   ```

2. **Simplified structure:**
   ```
   runId/instance/output/sim-output/-conversation-panel-instance/sim-requests-0.txt
   ```

Where:
- `runId`: Numeric run identifier (e.g., 16456557241)
- `instance`: Instance name (e.g., fix_mia_app, petclinic)

## API Endpoints

The web server provides a REST API:

### GET /api/scan
Scans a directory for sim-requests files.

**Query Parameters:**
- `root` (optional): Root directory to scan

**Response:**
```json
{
  "success": true,
  "root_folder": "/path/to/scanned/directory",
  "count": 5,
  "files": [
    {
      "fullPath": "/path/to/file/sim-requests-0.txt",
      "relativePath": "16456557241/javamigration.eval.x86_64.fix_mia_app-output/...",
      "displayName": "16456557241/fix_mia_app",
      "runId": "16456557241",
      "instance": "fix_mia_app",
      "size": 1234,
      "modified": 1642723200.0
    }
  ]
}
```

## Usage Tips

1. **For large directory trees:** The server recursively scans all subdirectories, so scanning very large directory trees may take some time.

2. **Path handling:** The server automatically expands `~` for home directory and resolves relative paths.

3. **File organization:** Files are automatically sorted by their display names for better organization.

4. **Fallback support:** If the Python server isn't available, the interface falls back to basic local file loading.

## Troubleshooting

### "Directory Scanning Error"
- Make sure the Python web server is running
- Check that the specified directory exists and is readable
- Verify the path is correct (use absolute paths when possible)

### "CORS Error" or "Network Error"
- You must use the Python web server; opening the HTML file directly won't work for directory scanning
- Make sure you're accessing `http://localhost:8000/request-viewer.html` (not `file://...`)

### No files found
- The directory may not contain any `sim-requests-*.txt` files
- Check that the files follow the expected naming pattern
- Try scanning a parent directory that contains multiple run folders

## Files

- `web_server.py`: Python web server with directory scanning API
- `request-viewer.html`: Enhanced HTML interface with API integration
- `README.md`: This documentation file

## Requirements

- Python 3.6 or later (uses standard library only)
- Modern web browser with JavaScript enabled
