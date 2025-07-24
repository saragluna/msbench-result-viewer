# MSBench Result Viewer - GitHub Pages

This repository automatically deploys to GitHub Pages when changes are made to:
- `request-viewer.html`
- `web_server.py` 
- `README.md`

## Live Demo
The viewer is available at: https://saragluna.github.io/msbench-result-viewer/

## Setup Instructions

### 1. Enable GitHub Pages
1. Go to your repository Settings
2. Navigate to "Pages" in the left sidebar
3. Under "Source", select "GitHub Actions"
4. The deployment will happen automatically on the next push

### 2. Repository Permissions
The workflow needs these permissions (already configured in the action):
- `contents: read` - to checkout the code
- `pages: write` - to deploy to GitHub Pages
- `id-token: write` - for authentication

### 3. Manual Deployment
You can also trigger a deployment manually:
1. Go to the "Actions" tab in your repository
2. Select "Deploy Request Viewer to GitHub Pages"
3. Click "Run workflow"

## Features Deployed

The GitHub Pages deployment includes:
- **Main Viewer** (`index.html`) - The interactive request viewer
- **Landing Page** (`README.html`) - Documentation and quick start guide
- **Web Server** (`web_server.py`) - For local development reference
- **Documentation** (`README.md`) - Repository documentation

## Limitations on GitHub Pages

Since GitHub Pages serves static files only, some features have limitations:
- **Folder Scanning**: Won't work (requires Python web server)
- **File Path APIs**: Limited to browser's file access
- **Drag & Drop**: ✅ Works perfectly
- **Manual File Input**: ✅ Works perfectly
- **Search & Navigation**: ✅ Works perfectly

For full functionality including folder scanning, run locally with:
```bash
python3 web_server.py
```
