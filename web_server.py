#!/usr/bin/env python3
"""
Web server for Request Viewer with real directory scanning capabilities.

This server provides:
1. Static file serving for the HTML interface
2. API endpoint to scan directories for sim-requests-*.txt files
3. Proper CORS handling for local development
"""

import os
import json
import re
import argparse
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class RequestViewerHandler(SimpleHTTPRequestHandler):
    """Custom HTTP handler with directory scanning capabilities."""
    
    def __init__(self, *args, **kwargs):
        # Allow CORS for local development
        super().__init__(*args, **kwargs)
    
    def end_headers(self):
        """Add CORS headers to all responses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests with API endpoints."""
        parsed_path = urlparse(self.path)
        
        # API endpoint for scanning directories
        if parsed_path.path == '/api/scan':
            self.handle_scan_request(parsed_path)
        # API endpoint for serving sim-requests files by full path
        elif parsed_path.path == '/api/file':
            self.handle_file_request(parsed_path)
        else:
            # Serve static files normally
            super().do_GET()
    
    def handle_scan_request(self, parsed_path):
        """Handle directory scanning API requests."""
        try:
            # Parse query parameters
            query_params = parse_qs(parsed_path.query)
            root_folder = query_params.get('root', [''])[0]
            
            logger.info(f"Scanning request for root folder: '{root_folder}'")
            
            # If no root folder provided, use current directory
            if not root_folder.strip():
                root_folder = os.getcwd()
            
            # Expand user home directory and resolve path
            root_folder = os.path.expanduser(root_folder)
            root_folder = os.path.abspath(root_folder)
            
            logger.info(f"Resolved root folder: {root_folder}")
            
            # Check if directory exists
            if not os.path.exists(root_folder):
                self.send_error_response(404, f"Directory not found: {root_folder}")
                return
            
            if not os.path.isdir(root_folder):
                self.send_error_response(400, f"Path is not a directory: {root_folder}")
                return
            
            # Scan for sim-requests files
            sim_files = self.find_sim_requests_files(root_folder)
            
            logger.info(f"Found {len(sim_files)} sim-requests files")
            
            # Send JSON response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            response_data = {
                'success': True,
                'root_folder': root_folder,
                'files': sim_files,
                'count': len(sim_files)
            }
            
            self.wfile.write(json.dumps(response_data, indent=2).encode('utf-8'))
            
        except Exception as e:
            logger.error(f"Error handling scan request: {e}")
            self.send_error_response(500, f"Internal server error: {str(e)}")
    
    def handle_file_request(self, parsed_path):
        """Handle file serving API requests."""
        try:
            # Parse query parameters
            query_params = parse_qs(parsed_path.query)
            file_path = query_params.get('path', [''])[0]
            
            logger.info(f"File request for: '{file_path}'")
            
            if not file_path.strip():
                self.send_error_response(400, "File path parameter is required")
                return
            
            # Expand and resolve the file path
            file_path = os.path.expanduser(file_path)
            file_path = os.path.abspath(file_path)
            
            logger.info(f"Resolved file path: {file_path}")
            
            # Security check - ensure it's a sim-requests file
            if not os.path.basename(file_path).startswith('sim-requests-') or not file_path.endswith('.txt'):
                self.send_error_response(403, "Access denied: Only sim-requests-*.txt files are allowed")
                return
            
            # Check if file exists
            if not os.path.exists(file_path):
                self.send_error_response(404, f"File not found: {file_path}")
                return
            
            if not os.path.isfile(file_path):
                self.send_error_response(400, f"Path is not a file: {file_path}")
                return
            
            # Read and serve the file
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(content.encode('utf-8'))))
                self.end_headers()
                
                self.wfile.write(content.encode('utf-8'))
                logger.info(f"Successfully served file: {file_path}")
                
            except Exception as e:
                logger.error(f"Error reading file {file_path}: {e}")
                self.send_error_response(500, f"Error reading file: {str(e)}")
                
        except Exception as e:
            logger.error(f"Error handling file request: {e}")
            self.send_error_response(500, f"Internal server error: {str(e)}")
    
    def find_sim_requests_files(self, root_folder):
        """
        Recursively find all sim-requests-*.txt files in the given directory.
        
        Returns a list of dictionaries with file information.
        """
        sim_files = []
        root_path = Path(root_folder)
        
        # Pattern to match sim-requests files - more inclusive pattern
        sim_pattern = re.compile(r'^sim-requests-.*\.txt$')
        
        logger.info(f"Scanning directory: {root_path}")
        logger.info(f"Looking for files matching pattern: sim-requests-*.txt")
        
        try:
            # Walk through all subdirectories
            for file_path in root_path.rglob('sim-requests-*.txt'):
                logger.debug(f"Examining file: {file_path.name}")
                if sim_pattern.match(file_path.name):
                    try:
                        # Extract meaningful path information
                        relative_path = file_path.relative_to(root_path)
                        display_info = self.extract_display_info(str(relative_path))
                        
                        file_info = {
                            'fullPath': str(file_path),
                            'relativePath': str(relative_path),
                            'displayName': display_info['displayName'],
                            'runId': display_info['runId'],
                            'instance': display_info['instance'],
                            'size': file_path.stat().st_size,
                            'modified': file_path.stat().st_mtime
                        }
                        
                        sim_files.append(file_info)
                        logger.debug(f"Added: {file_info['displayName']} -> {file_info['relativePath']}")
                        
                    except Exception as e:
                        logger.warning(f"Error processing file {file_path}: {e}")
                        continue
                else:
                    logger.debug(f"File {file_path.name} did not match pattern")
        
        except Exception as e:
            logger.error(f"Error scanning directory {root_folder}: {e}")
            raise
        
        # Sort by display name for better organization
        sim_files.sort(key=lambda x: x['displayName'])
        
        return sim_files
    
    def extract_display_info(self, relative_path):
        """
        Extract display information from a file path.
        
        Expected path patterns:
        - runId/javamigration.eval.x86_64.instance-output/output/sim-output/-conversation-panel-instance/sim-requests-0.txt
        - runId/instance/output/sim-output/-conversation-panel-instance/sim-requests-0.txt
        
        Returns dict with displayName, runId, and instance.
        """
        path_parts = relative_path.split('/')
        
        # Default values
        run_id = None
        instance = 'unknown'
        
        try:
            # The first part should be the run ID (numeric)
            if len(path_parts) > 0 and path_parts[0].isdigit():
                run_id = path_parts[0]
            
            # Look for conversation panel folders to extract instance name
            for part in path_parts:
                if part.startswith('-conversation-panel-'):
                    instance = part.replace('-conversation-panel-', '')
                    break
            
            # If no conversation panel found, try to extract from javamigration folder
            if instance == 'unknown':
                for part in path_parts:
                    if part.startswith('javamigration.eval.x86_64.') and part.endswith('-output'):
                        # Extract instance from javamigration.eval.x86_64.INSTANCE-output
                        instance = part.replace('javamigration.eval.x86_64.', '').replace('-output', '')
                        break
            
            # If still unknown, try to use the second path component
            if instance == 'unknown' and len(path_parts) > 1:
                instance = path_parts[1].split('.')[0]  # Take first part before any dots
        
        except Exception as e:
            logger.warning(f"Error extracting display info from {relative_path}: {e}")
        
        # Create display name - omit run_id if not found
        if run_id:
            display_name = f"{run_id}/{instance}"
        else:
            display_name = instance
        
        return {
            'displayName': display_name,
            'runId': run_id,
            'instance': instance
        }
    
    def send_error_response(self, status_code, message):
        """Send a JSON error response."""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        error_data = {
            'success': False,
            'error': message,
            'status_code': status_code
        }
        
        self.wfile.write(json.dumps(error_data, indent=2).encode('utf-8'))

def main():
    """Main function to start the web server."""
    parser = argparse.ArgumentParser(description='Request Viewer Web Server')
    parser.add_argument('--port', '-p', type=int, default=8000, 
                       help='Port to run the server on (default: 8000)')
    parser.add_argument('--host', default='localhost',
                       help='Host to bind the server to (default: localhost)')
    parser.add_argument('--directory', '-d', default='.',
                       help='Directory to serve files from (default: current directory)')
    
    args = parser.parse_args()
    
    # Change to the specified directory
    os.chdir(os.path.abspath(args.directory))
    
    # Create and start the server
    server_address = (args.host, args.port)
    httpd = HTTPServer(server_address, RequestViewerHandler)
    
    logger.info(f"Starting Request Viewer server...")
    logger.info(f"Server running at http://{args.host}:{args.port}/")
    logger.info(f"Serving files from: {os.getcwd()}")
    logger.info(f"Open http://{args.host}:{args.port}/request-viewer.html to use the interface")
    logger.info("Press Ctrl+C to stop the server")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("\nShutting down the server...")
        httpd.shutdown()
        httpd.server_close()

if __name__ == '__main__':
    main()
