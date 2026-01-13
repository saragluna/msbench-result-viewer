# MSBench Result Viewer - GitHub Pages

This repository automatically deploys to GitHub Pages when changes are pushed to the main branch.

## Live Demo
The viewer is available at: https://saragluna.github.io/msbench-result-viewer/

## Pull Request Previews 🚀

When you create a pull request, a preview deployment is automatically created! This allows you to:
- View your changes live before merging
- Share the preview with reviewers
- Test the changes in a production-like environment

### How PR Previews Work

1. **Automatic Deployment**: When you open or update a PR, a workflow automatically builds and deploys a preview
2. **Unique URL**: Each PR gets its own URL: `https://saragluna.github.io/msbench-result-viewer/pr-{number}/`
3. **Comment Notification**: A bot comment is added to your PR with the preview link
4. **Auto Updates**: The preview updates automatically when you push new commits
5. **Auto Cleanup**: The preview is removed when the PR is closed or merged

### Example

If you create PR #42, you'll get:
- Preview URL: `https://saragluna.github.io/msbench-result-viewer/pr-42/`
- A comment on the PR with the link
- Updates on every push to the PR
- Automatic removal when PR #42 is closed/merged

## Setup Instructions

### 1. Enable GitHub Pages
1. Go to your repository Settings
2. Navigate to "Pages" in the left sidebar
3. Under "Source", select "GitHub Actions"
4. The deployment will happen automatically on the next push

### 2. Repository Permissions
The workflows need these permissions (already configured):
- `contents: write` - to deploy to gh-pages branch
- `pages: write` - to deploy to GitHub Pages
- `id-token: write` - for authentication
- `pull-requests: write` - to comment on PRs with preview URLs

### 3. Manual Deployment
You can trigger a main deployment manually:
1. Go to the "Actions" tab in your repository
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"

## Workflows

### Main Deployment (`.github/workflows/deploy-pages.yml`)
- Triggers on push to `main` branch or manual dispatch
- Deploys to the root of GitHub Pages
- Preserves PR preview directories when deploying

### PR Preview (`.github/workflows/pr-preview.yml`)
- Triggers on PR open, update, or close
- Deploys PRs to `pr-{number}/` subdirectories
- Comments on PRs with preview URLs
- Cleans up when PRs are closed

## Features Deployed

The GitHub Pages deployment includes:
- **Main Viewer** (`index.html`) - The interactive request viewer
- **Legacy Viewer** (`legacy/`) - Python-based directory scanning UI
- **Documentation** - Repository documentation

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
