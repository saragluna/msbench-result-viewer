// Global variables
let currentRequestIndex = 0;
let requests = [];
let allFunctionCalls = [];
let selectedFunctionCallIndex = -1;
let searchTerm = '';
let highlightedFunctionCalls = [];
let responseSearchTerm = '';
let responseFilteredCalls = [];
let filteredSteps = []; // Array of indices for filtered steps
let currentFilterIndex = -1; // Current position in filtered results

// Function to scan for available sim-requests files using the Python web server
async function scanForSimRequestFiles(rootFolder = '') {
    try {
        console.log("Scanning for sim-requests files in folder:", rootFolder || "current directory");
        
        // Use the web server's API to scan for files
        const apiUrl = `/api/scan${rootFolder ? `?root=${encodeURIComponent(rootFolder)}` : ''}`;
        console.log("Making API request to:", apiUrl);
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        if (!data.success) {
            throw new Error(data.error || 'API request failed');
        }
        
        console.log(`Successfully scanned ${data.root_folder}`);
        console.log(`Found ${data.count} sim-requests files`);
        
        if (data.files && data.files.length > 0) {
            return populateFileDropdownWithDisplayNames(data.files);
        } else {
            console.warn('No sim-requests files found');
            // Fallback to local file if no files found via API
            const selectElement = document.getElementById('file-select');
            selectElement.innerHTML = '';
            const option = document.createElement('option');
            option.value = 'sim-requests-0.txt';
            option.textContent = 'sim-requests-0.txt (local fallback)';
            selectElement.appendChild(option);
            return false;
        }
        
    } catch (error) {
        console.error('Error scanning for sim-requests files:', error);
        
        // Show error message to user
        const container = document.getElementById('request-container');
        container.innerHTML = `
            <div class="error">
                <h3>Directory Scanning Error</h3>
                <p><strong>Error:</strong> ${error.message}</p>
                <p>This usually means:</p>
                <ul>
                    <li>The Python web server is not running</li>
                    <li>The specified directory doesn't exist</li>
                    <li>There are permission issues accessing the directory</li>
                </ul>
                <h4>To fix this:</h4>
                <ol>
                    <li>Make sure you're running this page through the Python web server:<br>
                        <code>python3 web_server.py</code></li>
                    <li>Check that the directory path is correct</li>
                    <li>Try using a local file instead by entering the filename in the manual input field</li>
                </ol>
            </div>
        `;
        
        // Fallback to hardcoded option
        const selectElement = document.getElementById('file-select');
        selectElement.innerHTML = '';
        const option = document.createElement('option');
        option.value = 'sim-requests-0.txt';
        option.textContent = 'sim-requests-0.txt (fallback)';
        selectElement.appendChild(option);
        
        return false;
    }
}

// Helper function to populate the file dropdown with display names
function populateFileDropdownWithDisplayNames(fileObjects) {
    const selectElement = document.getElementById('file-select');
    selectElement.innerHTML = '';
    
    if (fileObjects.length > 0) {
        fileObjects.forEach(fileObj => {
            const option = document.createElement('option');
            option.value = fileObj.fullPath;
            option.textContent = fileObj.displayName;
            // Add additional metadata as data attributes for potential future use
            option.setAttribute('data-run-id', fileObj.runId);
            option.setAttribute('data-instance', fileObj.instance);
            option.setAttribute('data-size', fileObj.size || '');
            selectElement.appendChild(option);
        });
        
        // Default to the first file
        selectElement.value = fileObjects[0].fullPath;
        console.log(`Populated dropdown with ${fileObjects.length} files`);
        return true;
    } else {
        // Fallback to hardcoded option if no files found
        const option = document.createElement('option');
        option.value = 'sim-requests-0.txt';
        option.textContent = 'sim-requests-0.txt (no files found)';
        selectElement.appendChild(option);
        
        console.warn('No sim-requests files found, using default');
        return false;
    }
}

// Helper function to populate the file dropdown (for backward compatibility)
function populateFileDropdown(files, isFullPath = false) {
    const selectElement = document.getElementById('file-select');
    selectElement.innerHTML = '';
    
    if (files.length > 0) {
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            // Show meaningful path components for better readability
            if (isFullPath) {
                const pathParts = file.split('/');
                const filename = pathParts[pathParts.length - 1];
                
                // Extract meaningful path components
                let displayPath = '';
                for (let i = pathParts.length - 1; i >= 0; i--) {
                    if (pathParts[i].match(/^\d+$/) || // numbered folders
                        pathParts[i].includes('javamigration') || // project folders
                        pathParts[i].includes('conversation-panel') || // conversation panels
                        pathParts[i] === 'sim-output' || 
                        pathParts[i] === 'output') {
                        displayPath = pathParts.slice(i).join('/');
                        break;
                    }
                }
                
                if (!displayPath) {
                    displayPath = pathParts.slice(-4).join('/'); // Show last 4 components as fallback
                }
                
                option.textContent = filename + ' (' + displayPath + ')';
            } else {
                option.textContent = file;
            }
            selectElement.appendChild(option);
        });
        
        // Default to the first file
        selectElement.value = files[0];
        return true;
    } else {
        // Fallback to hardcoded option if no files found
        const option = document.createElement('option');
        option.value = 'sim-requests-0.txt';
        option.textContent = 'sim-requests-0.txt';
        selectElement.appendChild(option);
        
        console.warn('No sim-requests files found, using default');
        return false;
    }
}

// Function to load the selected file
function loadSelectedFile() {
    const customFileInput = document.getElementById('custom-file');
    const selectElement = document.getElementById('file-select');
    
    // Use custom file input if provided, otherwise use the dropdown selection
    const fileName = customFileInput.value.trim() || selectElement.value;
    
    document.getElementById('request-container').innerHTML = 
        '<div class="loader">Loading requests from ' + fileName + '...</div>';
    
    console.log("Attempting to load file:", fileName);
    
    // Check if this looks like a full path (contains / or \)
    const isFullPath = fileName.includes('/') || fileName.includes('\\');
    
    if (isFullPath) {
        // Use the API endpoint for full paths
        const apiUrl = `/api/file?path=${encodeURIComponent(fileName)}`;
        console.log("Using API endpoint:", apiUrl);
        
        fetch(apiUrl)
            .then(response => {
                console.log("API response status:", response.status);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.text();
            })
            .then(text => {
                console.log("Got response text, length:", text.length);
                try {
                    const data = JSON.parse(text);
                    initializeViewer(data);
                } catch(e) {
                    // If direct parsing fails, try to extract JSON from the text
                    console.log("Direct parsing failed, trying to extract JSON", e);
                    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                    if (jsonMatch) {
                        const jsonData = JSON.parse(jsonMatch[0]);
                        initializeViewer(jsonData);
                    } else {
                        throw new Error("No valid JSON found in file");
                    }
                }
            })
            .catch(error => {
                console.error("Error loading file via API:", error);
                document.getElementById('request-container').innerHTML = 
                    '<div class="error">' +
                    '<h3>Failed to load the file via API</h3>' +
                    '<p><strong>File:</strong> ' + fileName + '</p>' +
                    '<p><strong>Error:</strong> ' + error.message + '</p>' +
                    '<p>This usually means:</p>' +
                    '<ul>' +
                    '<li>The file path is incorrect</li>' +
                    '<li>The file doesn\'t exist at the specified location</li>' +
                    '<li>There are permission issues accessing the file</li>' +
                    '<li>The Python web server is not running</li>' +
                    '</ul>' +
                    '<h4>To fix this:</h4>' +
                    '<ol>' +
                    '<li>Make sure you\'re running the Python web server:<br><code>python3 web_server.py</code></li>' +
                    '<li>Check that the file path is correct</li>' +
                    '<li>Try using a shorter relative path in the manual input field</li>' +
                    '</ol>' +
                    '</div>';
            });
    } else {
        // Use direct file loading for relative paths (backward compatibility)
        loadFileDirectly(fileName);
    }
}

// Function to load from textarea (for manual input)
function loadFromTextarea() {
    const textarea = document.getElementById('manual-input');
    const text = textarea.value.trim();
    
    if (!text) {
        alert('Please paste the file contents in the text area first.');
        return;
    }
    
    document.getElementById('request-container').innerHTML = 
        '<div class="loader">Loading requests from manual input...</div>';
    
    try {
        // Try to parse the JSON directly
        const data = JSON.parse(text);
        initializeViewer(data);
    } catch(e) {
        // If direct parsing fails, try to extract JSON from the text
        console.log("Direct parsing failed, trying to extract JSON", e);
        try {
            const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[0]);
                initializeViewer(jsonData);
            } else {
                throw new Error('No valid JSON array found');
            }
        } catch(e2) {
            console.error("Failed to extract valid JSON:", e2);
            document.getElementById('request-container').innerHTML = 
                '<div class="error">' +
                '<h3>Failed to parse the pasted content</h3>' +
                '<p>The content does not contain valid JSON data. Please check the format.</p>' +
                '<p>Expected format: JSON array of request objects</p>' +
                '</div>';
        }
    }
}

// Function to load files directly (for backward compatibility)
function loadFileDirectly(fileName) {
    // Try to construct the absolute URL for debugging
    let absoluteUrl;
    try {
        absoluteUrl = new URL(fileName, window.location.href).href;
    } catch (e) {
        absoluteUrl = window.location.href.split('/').slice(0, -1).join('/') + '/' + fileName;
    }
    
    console.log("Loading file directly:", fileName);
    console.log("Full URL:", absoluteUrl);
    
    // Using XMLHttpRequest which may have better compatibility with local files
    const xhr = new XMLHttpRequest();
    xhr.open('GET', fileName, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            console.log("XHR status:", xhr.status);
            
            // For local files, status 0 might be valid
            if (xhr.status === 200 || xhr.status === 0 && xhr.responseText && xhr.responseText.length > 0) {
                try {
                    const text = xhr.responseText;
                    console.log("Got response text, length:", text.length);
                    
                    // Try to parse the JSON directly
                    const data = JSON.parse(text);
                    initializeViewer(data);
                } catch(e) {
                    // If direct parsing fails, try to extract JSON from the text
                    console.log("Direct parsing failed, trying to extract JSON", e);
                    try {
                        const text = xhr.responseText;
                        const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                        if (jsonMatch) {
                            try {
                                const jsonData = JSON.parse(jsonMatch[0]);
                                initializeViewer(jsonData);
                            } catch(e2) {
                                console.error("Failed to extract valid JSON:", e2);
                                document.getElementById('request-container').innerHTML = '<div class="error">Failed to parse the file. It may not contain valid JSON.</div>';
                            }
                        } else {
                            console.error("No JSON array found in the file");
                            document.getElementById('request-container').innerHTML = '<div class="error">No JSON array found in the file.</div>';
                        }
                    } catch (parseErr) {
                        console.error("Error processing response:", parseErr);
                        document.getElementById('request-container').innerHTML = '<div class="error">Failed to process the file content.</div>';
                    }
                }
            } else {
                console.error("Error fetching the file:", xhr.statusText, "Status:", xhr.status);
                document.getElementById('request-container').innerHTML = 
                    '<div class="error">' +
                    '<h3>Failed to load the file</h3>' +
                    '<p>Status: ' + xhr.status + ' - ' + xhr.statusText + '</p>' +
                    '<p>This usually happens when trying to load local files in a browser due to CORS restrictions.</p>' +
                    '<h4>Solutions:</h4>' +
                    '<ol>' +
                    '<li><strong>Use a local web server:</strong><br>' +
                    'Run <code>python3 -m http.server 8000</code> or <code>python -m http.server 8000</code> in this directory, then open <a href="http://localhost:8000/index.html">http://localhost:8000/index.html</a></li>' +
                    '<li><strong>Use VS Code Live Server:</strong><br>' +
                    'Install the "Live Server" extension in VS Code, then right-click this file and select "Open with Live Server"</li>' +
                    '<li><strong>Copy file contents manually:</strong><br>' +
                    'Open the ' + fileName + ' file, copy its contents, and paste them in the text area below</li>' +
                    '</ol>' +
                    '<h4>Manual File Input:</h4>' +
                    '<textarea id="manual-input" placeholder="Paste the contents of ' + fileName + ' here..." style="width: 100%; height: 200px; margin: 10px 0; font-family: monospace; border: 1px solid #ddd; border-radius: 4px; padding: 10px;"></textarea><br>' +
                    '<button onclick="loadFromTextarea()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">Load from Text Above</button>' +
                    '</div>';
            }
        }
    };
    xhr.onerror = function() {
        console.error("Request error occurred");
        document.getElementById('request-container').innerHTML = 
            '<div class="error">' +
            '<h3>Failed to load the file - Network/CORS Error</h3>' +
            '<p>This error occurs because browsers prevent local HTML files from loading other local files due to security restrictions.</p>' +
            '<h4>Solutions:</h4>' +
            '<ol>' +
            '<li><strong>Use a local web server:</strong><br>' +
            'Run <code>python -m http.server 8000</code> in this directory, then open <a href="http://localhost:8000/index.html">http://localhost:8000/index.html</a></li>' +
            '<li><strong>Use VS Code Live Server:</strong><br>' +
            'Install the "Live Server" extension in VS Code, then right-click this file and select "Open with Live Server"</li>' +
            '<li><strong>Copy file contents manually:</strong><br>' +
            'Open the sim-requests-0.txt file, copy its contents, and paste them in the text area below</li>' +
            '</ol>' +
            '<h4>Manual File Input:</h4>' +
            '<textarea id="manual-input" placeholder="Paste the contents of sim-requests-0.txt here..." style="width: 100%; height: 200px; margin: 10px 0; font-family: monospace;"></textarea>' +
            '<button onclick="loadFromTextarea()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Load from Text Above</button>' +
            '</div>';
    };
    xhr.send();
}

// Back to Top functionality
function setupBackToTop() {
    const backToTopButton = document.getElementById('back-to-top');
    
    // Show/hide button based on scroll position
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTopButton.classList.add('visible');
        } else {
            backToTopButton.classList.remove('visible');
        }
    });
    
    // Smooth scroll to top when clicked
    backToTopButton.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    // Set up drag and drop functionality
    setupDragAndDrop();
    
    // Set up folder options collapsible functionality
    setupFolderOptions();
    
    // Set up back to top functionality
    setupBackToTop();
    
    // Set up navigation event listeners (only once)
    setupNavigationEventListeners();
    
    // Set up search functionality (only once)
    setupSearchFunctionality();            // Start with a scan of the current directory
            scanForSimRequestFiles().then(() => {
                // Set up the refresh button
                document.getElementById('refresh-btn').addEventListener('click', loadSelectedFile);
                
                // Set up the scan folder button with better error handling
                document.getElementById('scan-btn').addEventListener('click', async () => {
                    const rootFolder = document.getElementById('root-folder').value.trim();
                    console.log('Scan button clicked, root folder:', rootFolder);
                    
                    // Show loading state
                    const scanBtn = document.getElementById('scan-btn');
                    const originalText = scanBtn.textContent;
                    scanBtn.textContent = 'Scanning...';
                    scanBtn.disabled = true;
                    
                    try {
                        await scanForSimRequestFiles(rootFolder);
                        console.log('Folder scan completed successfully');
                    } catch (error) {
                        console.error('Folder scan failed:', error);
                    } finally {
                        // Restore button state
                        scanBtn.textContent = originalText;
                        scanBtn.disabled = false;
                    }
                });
                
                // Load the default file
                loadSelectedFile();
            }).catch(error => {
                console.error('Initial scan failed:', error);
                // Still set up event listeners even if initial scan fails
                document.getElementById('refresh-btn').addEventListener('click', loadSelectedFile);
                document.getElementById('scan-btn').addEventListener('click', async () => {
                    const rootFolder = document.getElementById('root-folder').value.trim();
                    await scanForSimRequestFiles(rootFolder);
                });
            });
});

// Function to set up folder options collapsible functionality
function setupFolderOptions() {
    const header = document.getElementById('folder-options-header');
    const content = document.getElementById('folder-options-content');
    const toggle = document.getElementById('folder-options-toggle');
    
    header.addEventListener('click', function() {
        const isExpanded = content.classList.contains('expanded');
        
        if (isExpanded) {
            content.classList.remove('expanded');
            toggle.style.transform = 'rotate(0deg)';
        } else {
            content.classList.add('expanded');
            toggle.style.transform = 'rotate(180deg)';
        }
    });
}

// Function to set up drag and drop functionality
function setupDragAndDrop() {
    const dragDropArea = document.getElementById('drag-drop-area');
    const fileInput = document.getElementById('file-input');

    // Click to browse files
    dragDropArea.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change event
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileLoad(file);
        }
    });

    // Drag and drop events
    dragDropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dragDropArea.classList.add('drag-over');
    });

    dragDropArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragDropArea.classList.remove('drag-over');
    });

    dragDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDropArea.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileLoad(files[0]);
        }
    });

    // Prevent default drag behaviors on the document
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
}

// Function to handle file loading from drag and drop or file picker
function handleFileLoad(file) {
    console.log('Loading file:', file.name);
    
    // Show loading message
    document.getElementById('request-container').innerHTML = 
        '<div class="loader">Loading requests from ' + file.name + '...</div>';
    
    // Update the drag drop area to show the selected file
    const dragDropArea = document.getElementById('drag-drop-area');
    dragDropArea.innerHTML = `
        <div class="upload-icon">✅</div>
        <h3>File loaded: ${file.name}</h3>
        <p>Click to select a different file</p>
    `;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        try {
            const data = JSON.parse(text);
            console.log("Successfully loaded data from drag and drop:", data);
            initializeViewer(data);
        } catch(error) {
            console.error("Failed to parse JSON from file:", error);
            document.getElementById('request-container').innerHTML = 
                '<div class="error">Failed to parse the JSON file. Please check the file format.</div>';
            resetDragDropArea();
        }
    };
    
    reader.onerror = function() {
        console.error("Failed to read file");
        document.getElementById('request-container').innerHTML = 
            '<div class="error">Failed to read the file. Please try again.</div>';
        resetDragDropArea();
    };
    
    reader.readAsText(file);
}

// Function to reset the drag drop area to its initial state
function resetDragDropArea() {
    const dragDropArea = document.getElementById('drag-drop-area');
    dragDropArea.innerHTML = `
        <div class="upload-icon">📁</div>
        <h3>Drop sim-requests file here</h3>
        <p>Drag and drop a sim-requests file, or click to browse</p>
        <input type="file" id="file-input" class="file-input-hidden" accept=".txt,.json">
    `;
    
    // Re-setup the file input event listener
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileLoad(file);
        }
    });
}        function initializeViewer(data) {
            // Reset all navigation state when loading a new file
            requests = data;
            currentRequestIndex = 0;
            selectedFunctionCallIndex = 0; // Start with first function call selected
            searchTerm = '';
            highlightedFunctionCalls = [];
            responseSearchTerm = '';
            responseFilteredCalls = [];
            filteredSteps = [];
            currentFilterIndex = -1;
            
            // Clear any existing function call button selections
            document.querySelectorAll('.function-call-item').forEach(btn => {
                btn.classList.remove('selected');
            });
            
            // Collect all function calls from all requests, including steps with no function calls
            allFunctionCalls = [];
            requests.forEach((request, requestIndex) => {
                if (request.response && request.response.copilotFunctionCalls && request.response.copilotFunctionCalls.length > 0) {
                    request.response.copilotFunctionCalls.forEach((call, callIndex) => {
                        allFunctionCalls.push({
                            requestIndex: requestIndex,
                            callIndex: callIndex,
                            name: call.name || 'Unknown Function',
                            arguments: call.arguments,
                            request: request,
                            hasFunction: true
                        });
                    });
                } else {
                    // Add entry for steps with no function calls
                    allFunctionCalls.push({
                        requestIndex: requestIndex,
                        callIndex: -1,
                        name: 'None',
                        arguments: null,
                        request: request,
                        hasFunction: false
                    });
                }
            });
            
            // Create function calls overview
            createFunctionCallsOverview();
            
            // Set up search functionality (clear any existing search state)
            document.getElementById('search-input').value = '';
            document.getElementById('response-search-input').value = '';
            // Note: setupSearchFunctionality is called only once during page initialization
            
            document.getElementById('total-requests').textContent = allFunctionCalls.length;
            document.getElementById('current-index').textContent = '1';
            
            // Reset navigation buttons
            document.getElementById('prev-btn-side').disabled = true;
            document.getElementById('next-btn-side').disabled = allFunctionCalls.length <= 1;
            
            // Hide filter navigation initially
            updateFilterNavigation();
            
            // Select the first function call to set up proper navigation state
            if (allFunctionCalls.length > 0) {
                selectFunctionCall(0);
            } else {
                renderRequest(0);
            }
            
            // Scroll to top of the page when new file is loaded
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

// Set up navigation event listeners (only called once during page initialization)
function setupNavigationEventListeners() {
    // Add event listeners for main navigation buttons
    document.getElementById('prev-btn-side').addEventListener('click', () => {
        console.log('Previous button clicked - selectedFunctionCallIndex:', selectedFunctionCallIndex);
        if (selectedFunctionCallIndex >= 0) {
            // Navigate through function calls sequence
            if (selectedFunctionCallIndex > 0) {
                selectFunctionCall(selectedFunctionCallIndex - 1);
            } else {
                console.log('Already at first function call');
            }
        } else {
            console.log('Using legacy request navigation');
            // Navigate through requests sequence (legacy behavior)
            if (currentRequestIndex > 0) {
                currentRequestIndex--;
                renderRequest(currentRequestIndex);
                document.getElementById('current-index').textContent = (currentRequestIndex + 1);
                document.getElementById('prev-btn-side').disabled = currentRequestIndex === 0;
                document.getElementById('next-btn-side').disabled = false;
            }
        }
    });
    
    document.getElementById('next-btn-side').addEventListener('click', () => {
        console.log('Next button clicked - selectedFunctionCallIndex:', selectedFunctionCallIndex, 'allFunctionCalls.length:', allFunctionCalls.length);
        if (selectedFunctionCallIndex >= 0) {
            // Navigate through function calls sequence
            if (selectedFunctionCallIndex < allFunctionCalls.length - 1) {
                selectFunctionCall(selectedFunctionCallIndex + 1);
            } else {
                console.log('Already at last function call');
            }
        } else {
            console.log('Using legacy request navigation');
            // Navigate through requests sequence (legacy behavior)
            if (currentRequestIndex < requests.length - 1) {
                currentRequestIndex++;
                renderRequest(currentRequestIndex);
                document.getElementById('current-index').textContent = (currentRequestIndex + 1);
                document.getElementById('next-btn-side').disabled = currentRequestIndex === requests.length - 1;
                document.getElementById('prev-btn-side').disabled = false;
            }
        }
    });
    
    // Add event listeners for filter navigation buttons
    document.getElementById('prev-filter-btn').addEventListener('click', () => {
        if (filteredSteps.length > 0 && currentFilterIndex > 0) {
            currentFilterIndex--;
            const targetIndex = filteredSteps[currentFilterIndex];
            selectFunctionCall(targetIndex);
            updateFilterStatus();
        }
    });
    
    document.getElementById('next-filter-btn').addEventListener('click', () => {
        if (filteredSteps.length > 0 && currentFilterIndex < filteredSteps.length - 1) {
            currentFilterIndex++;
            const targetIndex = filteredSteps[currentFilterIndex];
            selectFunctionCall(targetIndex);
            updateFilterStatus();
        }
    });
}

function setupSearchFunctionality() {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const clearButton = document.getElementById('clear-search');
    
    const responseSearchInput = document.getElementById('response-search-input');
    const responseSearchButton = document.getElementById('response-search-button');
    const clearResponseButton = document.getElementById('clear-response-search');
    
    // Function calls search function
    function performSearch() {
        const term = searchInput.value.trim().toLowerCase();
        searchTerm = term;
        
        if (!term) {
            clearSearch();
            return;
        }
        
        // Find matching function calls - only search by function name
        highlightedFunctionCalls = [];
        allFunctionCalls.forEach((functionCall, index) => {
            const matchesName = functionCall.name.toLowerCase().includes(term);
            
            if (matchesName) {
                highlightedFunctionCalls.push(index);
            }
        });
        
        // Apply both filters
        updateSearchHighlighting();
    }
    
    // Response text search function
    function performResponseSearch() {
        const term = responseSearchInput.value.trim().toLowerCase();
        responseSearchTerm = term;
        
        if (!term) {
            clearResponseSearch();
            return;
        }
        
        // Find matching steps based on response content
        responseFilteredCalls = [];
        allFunctionCalls.forEach((functionCall, index) => {
            const request = functionCall.request;
            let matchesResponse = false;
            
            // Search in response value
            if (request.response && request.response.value && request.response.value.length > 0) {
                const responseText = request.response.value.join(' ').toLowerCase();
                if (responseText.includes(term)) {
                    matchesResponse = true;
                }
            }
            
            // Search in function call arguments
            if (request.response && request.response.copilotFunctionCalls) {
                request.response.copilotFunctionCalls.forEach(call => {
                    if (call.arguments) {
                        const argsText = call.arguments.toLowerCase();
                        if (argsText.includes(term)) {
                            matchesResponse = true;
                        }
                    }
                });
            }
            
            // Search in request messages
            if (request.requestMessages) {
                request.requestMessages.forEach(message => {
                    if (message.content && Array.isArray(message.content)) {
                        message.content.forEach(content => {
                            if (content.text && content.text.toLowerCase().includes(term)) {
                                matchesResponse = true;
                            }
                        });
                    }
                });
            }
            
            if (matchesResponse) {
                responseFilteredCalls.push(index);
            }
        });
        
        // Apply both filters
        updateSearchHighlighting();
    }
    
    // Clear function calls search
    function clearSearch() {
        searchTerm = '';
        highlightedFunctionCalls = [];
        searchInput.value = '';
        updateSearchHighlighting();
    }
    
    // Clear response search
    function clearResponseSearch() {
        responseSearchTerm = '';
        responseFilteredCalls = [];
        responseSearchInput.value = '';
        updateSearchHighlighting();
    }
    
    // Function calls search event listeners
    searchButton.addEventListener('click', performSearch);
    clearButton.addEventListener('click', clearSearch);
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performSearch, 300);
    });
    
    // Response search event listeners
    responseSearchButton.addEventListener('click', performResponseSearch);
    clearResponseButton.addEventListener('click', clearResponseSearch);
    
    responseSearchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performResponseSearch();
        }
    });
    
    let responseSearchTimeout;
    responseSearchInput.addEventListener('input', function() {
        clearTimeout(responseSearchTimeout);
        responseSearchTimeout = setTimeout(performResponseSearch, 300);
    });
}

function updateSearchHighlighting() {
    // Apply both function calls and response text filters
    const listContainer = document.getElementById('function-calls-list');
    
    // If no search terms, show all function calls
    if (!searchTerm && !responseSearchTerm) {
        createFunctionCallsOverview();
        filteredSteps = [];
        currentFilterIndex = -1;
        updateFilterNavigation();
        return;
    }
    
    // Determine which items to show based on active filters
    let itemsToShow = [];
    
    if (searchTerm && responseSearchTerm) {
        // Both filters active - show intersection
        itemsToShow = highlightedFunctionCalls.filter(index => 
            responseFilteredCalls.includes(index)
        );
    } else if (searchTerm) {
        // Only function calls filter active
        itemsToShow = highlightedFunctionCalls;
    } else if (responseSearchTerm) {
        // Only response filter active
        itemsToShow = responseFilteredCalls;
    }
    
    // Update filtered steps for navigation
    filteredSteps = itemsToShow.sort((a, b) => a - b);
    
    // Update current filter index based on currently selected function call
    if (filteredSteps.length > 0 && selectedFunctionCallIndex >= 0) {
        currentFilterIndex = filteredSteps.indexOf(selectedFunctionCallIndex);
        if (currentFilterIndex === -1) {
            // If current selection is not in filtered results, select first filtered item
            currentFilterIndex = 0;
            selectFunctionCall(filteredSteps[0]);
            return; // Early return to avoid duplicate rendering
        }
    } else {
        currentFilterIndex = filteredSteps.length > 0 ? 0 : -1;
    }
    
    // Update filter navigation
    updateFilterNavigation();
    
    // Clear the list and show filtered results
    listContainer.innerHTML = '';
    
    if (itemsToShow.length === 0) {
        listContainer.innerHTML = '<div class="no-function-calls">No steps match your search criteria.</div>';
    } else {
        // Show matching function calls
        itemsToShow.forEach(originalIndex => {
            const functionCall = allFunctionCalls[originalIndex];
            const button = document.createElement('button');
            button.className = 'function-call-item';
            button.textContent = `${originalIndex + 1}. ${functionCall.name}`;
            button.title = functionCall.hasFunction ? 
                `Click to view request ${functionCall.requestIndex + 1} and highlight this function call` :
                `Click to view request ${functionCall.requestIndex + 1} (no function calls)`;
            button.onclick = () => {
                selectFunctionCall(originalIndex);
                // Update filter index when clicking on filtered item
                currentFilterIndex = filteredSteps.indexOf(originalIndex);
                updateFilterStatus();
            };
            
            // Apply color based on function name
            const functionColor = getFunctionColor(functionCall.name);
            button.style.backgroundColor = functionColor;
            
            // Store the color and original index for later use
            button.setAttribute('data-color', functionColor);
            button.setAttribute('data-original-index', originalIndex);
            
            // Add hover effect that darkens the color
            button.addEventListener('mouseenter', function() {
                if (!this.classList.contains('selected')) {
                    this.style.backgroundColor = darkenColor(functionColor, 20);
                }
            });
            
            button.addEventListener('mouseleave', function() {
                if (!this.classList.contains('selected')) {
                    this.style.backgroundColor = functionColor;
                }
            });
            
            // Maintain selection state if this was the selected function call
            if (selectedFunctionCallIndex === originalIndex) {
                button.classList.add('selected');
                button.style.backgroundColor = '#28a745';
            }
            
            listContainer.appendChild(button);
        });
    }
    
    // Update the overview text to show search results
    updateSearchResultsInfo();
}

// Function to update filter navigation visibility and button states
function updateFilterNavigation() {
    const prevFilterBtn = document.getElementById('prev-filter-btn');
    const nextFilterBtn = document.getElementById('next-filter-btn');
    const filterStatus = document.querySelector('.filter-status');
    
    if (filteredSteps.length > 1) {
        // Show filter navigation
        prevFilterBtn.classList.add('visible');
        nextFilterBtn.classList.add('visible');
        filterStatus.classList.add('visible');
        
        // Update button states
        prevFilterBtn.disabled = currentFilterIndex <= 0;
        nextFilterBtn.disabled = currentFilterIndex >= filteredSteps.length - 1;
        
        updateFilterStatus();
    } else {
        // Hide filter navigation
        prevFilterBtn.classList.remove('visible');
        nextFilterBtn.classList.remove('visible');
        filterStatus.classList.remove('visible');
    }
}

// Function to update filter status display
function updateFilterStatus() {
    if (filteredSteps.length > 0) {
        document.getElementById('filter-current').textContent = currentFilterIndex + 1;
        document.getElementById('filter-total').textContent = filteredSteps.length;
        
        // Update button states
        const prevFilterBtn = document.getElementById('prev-filter-btn');
        const nextFilterBtn = document.getElementById('next-filter-btn');
        prevFilterBtn.disabled = currentFilterIndex <= 0;
        nextFilterBtn.disabled = currentFilterIndex >= filteredSteps.length - 1;
    }
}

function updateSearchResultsInfo() {
    const overviewContainer = document.getElementById('function-calls-overview');
    const existingInfo = overviewContainer.querySelector('.search-results-info');
    
    // Remove existing info
    if (existingInfo) {
        existingInfo.remove();
    }
    
    // Add new info if there are active searches
    if ((searchTerm || responseSearchTerm)) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'search-results-info';
        infoDiv.style.cssText = 'margin-bottom: 10px; padding: 8px 12px; background-color: #e7f3ff; border: 1px solid #b8daff; border-radius: 4px; font-size: 14px;';
        
        let infoText = '';
        let resultCount = 0;
        
        if (searchTerm && responseSearchTerm) {
            // Both searches active
            const intersectionCount = highlightedFunctionCalls.filter(index => 
                responseFilteredCalls.includes(index)
            ).length;
            resultCount = intersectionCount;
            infoText = `<strong>${intersectionCount} steps match both searches:</strong><br>` +
                      `"${searchTerm}" in function calls (${highlightedFunctionCalls.length} matches) AND<br>` +
                      `"${responseSearchTerm}" in responses (${responseFilteredCalls.length} matches)`;
        } else if (searchTerm) {
            // Only function calls search
            resultCount = highlightedFunctionCalls.length;
            infoText = `<strong>${highlightedFunctionCalls.length} function call matches found</strong> for "${searchTerm}"`;
        } else if (responseSearchTerm) {
            // Only response search
            resultCount = responseFilteredCalls.length;
            infoText = `<strong>${responseFilteredCalls.length} response matches found</strong> for "${responseSearchTerm}"`;
        }
        
        if (resultCount === 0) {
            infoDiv.innerHTML = `<strong>No matches found</strong><br>${infoText.replace('<strong>', '').replace('</strong>', '')}`;
            infoDiv.style.backgroundColor = '#f8d7da';
            infoDiv.style.borderColor = '#f5c6cb';
        } else {
            infoDiv.innerHTML = infoText;
        }
        
        const listContainer = document.getElementById('function-calls-list');
        overviewContainer.insertBefore(infoDiv, listContainer);
    }
}

// Function to generate a consistent color for a function name
function getFunctionColor(functionName) {
    // Special color for "None" entries
    if (functionName === 'None') {
        return '#6c757d'; // Gray color for None
    }
    
    // Define a set of colors for different function names
    const colors = [
        '#007bff', // Blue
        '#28a745', // Green
        '#dc3545', // Red
        '#ffc107', // Yellow
        '#17a2b8', // Cyan
        '#6f42c1', // Purple
        '#fd7e14', // Orange
        '#20c997', // Teal
        '#e83e8c', // Pink
        '#343a40', // Dark
        '#495057'  // Darker gray
    ];
    
    // Create a simple hash from the function name
    let hash = 0;
    for (let i = 0; i < functionName.length; i++) {
        const char = functionName.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Use the hash to select a color
    const colorIndex = Math.abs(hash) % colors.length;
    return colors[colorIndex];
}

// Function to darken a hex color by a percentage
function darkenColor(color, percent) {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Darken each component
    const darkenAmount = percent / 100;
    const newR = Math.round(r * (1 - darkenAmount));
    const newG = Math.round(g * (1 - darkenAmount));
    const newB = Math.round(b * (1 - darkenAmount));
    
    // Convert back to hex
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

function createFunctionCallsOverview() {
    const overviewContainer = document.getElementById('function-calls-overview');
    const listContainer = document.getElementById('function-calls-list');
    
    if (allFunctionCalls.length === 0) {
        overviewContainer.style.display = 'block';
        listContainer.innerHTML = '<div class="no-function-calls">No requests found.</div>';
        return;
    }
    
    overviewContainer.style.display = 'block';
    listContainer.innerHTML = '';
    
    allFunctionCalls.forEach((functionCall, index) => {
        const button = document.createElement('button');
        button.className = 'function-call-item';
        button.textContent = `${index + 1}. ${functionCall.name}`;
        button.title = functionCall.hasFunction ? 
            `Click to view request ${functionCall.requestIndex + 1} and highlight this function call` :
            `Click to view request ${functionCall.requestIndex + 1} (no function calls)`;
        button.onclick = () => selectFunctionCall(index);
        
        // Apply color based on function name
        const functionColor = getFunctionColor(functionCall.name);
        button.style.backgroundColor = functionColor;
        
        // Store the color for hover effects
        button.setAttribute('data-color', functionColor);
        
        // Add hover effect that darkens the color
        button.addEventListener('mouseenter', function() {
            if (!this.classList.contains('selected')) {
                // Darken the color on hover
                this.style.backgroundColor = darkenColor(functionColor, 20);
            }
        });
        
        button.addEventListener('mouseleave', function() {
            if (!this.classList.contains('selected')) {
                this.style.backgroundColor = functionColor;
            }
        });
        
        listContainer.appendChild(button);
    });
    
    // Update search highlighting if there's an active search
    if (searchTerm || responseSearchTerm) {
        updateSearchHighlighting();
    }
}

function selectFunctionCall(index) {
    console.log('selectFunctionCall called with index:', index, 'allFunctionCalls.length:', allFunctionCalls.length);
    selectedFunctionCallIndex = index;
    const functionCall = allFunctionCalls[index];
    
    // Update the current request to match the selected function call
    currentRequestIndex = functionCall.requestIndex;
    document.getElementById('current-index').textContent = (index + 1); // Show function call sequence number
    
    // Update navigation buttons based on function call sequence
    document.getElementById('prev-btn-side').disabled = index === 0;
    document.getElementById('next-btn-side').disabled = index === allFunctionCalls.length - 1;
    console.log('Navigation buttons updated - prev disabled:', index === 0, 'next disabled:', index === allFunctionCalls.length - 1);
    
    // Update button styles
    document.querySelectorAll('.function-call-item').forEach((btn, btnIndex) => {
        if (btnIndex === index) {
            btn.classList.add('selected');
            // Use a consistent selected color (green)
            btn.style.backgroundColor = '#28a745';
        } else {
            btn.classList.remove('selected');
            // Restore original color
            const originalColor = btn.getAttribute('data-color');
            btn.style.backgroundColor = originalColor;
        }
    });
    
    // Preserve search filtering
    if (searchTerm || responseSearchTerm) {
        updateSearchHighlighting();
        // Re-add selected class to the clicked button (it might have been removed by search filtering)
        const visibleButtons = document.querySelectorAll('.function-call-item');
        visibleButtons.forEach(btn => {
            if (parseInt(btn.getAttribute('data-original-index')) === index) {
                btn.classList.add('selected');
                btn.style.backgroundColor = '#28a745';
            }
        });
    }
    
    // Render the request with focus on the selected function call
    renderRequest(currentRequestIndex, functionCall.hasFunction ? functionCall.callIndex : -1);
    
    // Scroll to the last message in the request messages section
    setTimeout(() => {
        scrollToLastMessage();
    }, 100); // Small delay to ensure the content is rendered
}

// Function to scroll to the last message in the request messages
function scrollToLastMessage() {
    // Find all message elements
    const messages = document.querySelectorAll('.message');
    if (messages.length > 0) {
        // Get the last message
        const lastMessage = messages[messages.length - 1];
        
        // Ensure the Request Messages section is expanded first
        const requestMessagesSection = document.querySelector('.messages-section');
        if (requestMessagesSection) {
            const collapsibleButton = requestMessagesSection.querySelector('.collapsible');
            const contentDiv = requestMessagesSection.querySelector('.content');
            
            if (collapsibleButton && contentDiv) {
                // Expand the section if it's not already expanded
                if (!contentDiv.classList.contains('expanded')) {
                    collapsibleButton.classList.add('active');
                    contentDiv.classList.add('expanded');
                    contentDiv.style.maxHeight = 'none';
                }
                
                // Scroll to the last message with smooth animation
                lastMessage.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
                
                // Add a subtle highlight effect to the last message
                lastMessage.style.transition = 'background-color 0.5s ease';
                const originalBackground = window.getComputedStyle(lastMessage).backgroundColor;
                lastMessage.style.backgroundColor = '#fff3cd';
                
                // Remove highlight after 2 seconds
                setTimeout(() => {
                    lastMessage.style.backgroundColor = originalBackground;
                }, 2000);
            }
        }
    }
}

function renderRequest(index, highlightFunctionCallIndex = -1) {
    const request = requests[index];
    const container = document.getElementById('request-container');
    
    let html = `
        <div class="request-header">
            <div>
                <span class="request-id">Request ID: ${request.response?.requestId || 'N/A'}</span>
                <span class="model-info">Model: ${request.model || 'Unknown'}</span>
            </div>
            <button class="copy-raw-button" onclick="copyRawRequestResponse(${index})" title="Copy raw request and response data">
                📋 Copy Raw Data
                <div class="copy-tooltip">Click to copy raw JSON</div>
            </button>
        </div>
    `;
    
    // Render request messages
    html += '<div class="messages-section">';
    html += '<button class="collapsible">Request Messages</button>';
    html += '<div class="content">';
    
    if (request.requestMessages && request.requestMessages.length > 0) {
        html += '<ul style="list-style-type: none; padding-left: 0;">';
        
        request.requestMessages.forEach(message => {
            const role = message.role;
            const roleClass = role === 'user' ? 'user-message' : 
                              role === 'assistant' ? 'assistant-message' : 
                              role === 'system' ? 'system-message' : 'tool-message';
            
            html += `<li class="message ${roleClass}">`;
            html += `<div class="message-role">${role.toUpperCase()}</div>`;
            
            if (message.content) {
                message.content.forEach((content, contentIndex) => {
                    const contentId = `content-${index}-${role}-${contentIndex}`;
                    // Use meaningful labels based on role and content index
                    let contentLabel;
                    if (role === 'tool' && contentIndex === 0) {
                        contentLabel = 'Tool call result';
                    } else if (role === 'tool' && contentIndex === 1) {
                        contentLabel = 'Metadata';
                    } else if (role === 'assistant' && contentIndex === 0) {
                        contentLabel = 'Assistant';
                    } else if (contentIndex === 0) {
                        contentLabel = 'Prompt';
                    } else if (contentIndex === 1) {
                        contentLabel = 'Metadata';
                    } else {
                        contentLabel = `Content ${contentIndex + 1}`;
                    }
                    html += `<button class="collapsible" style="margin: 5px 0; font-size: 0.9em; background-color: rgba(0,0,0,0.05);">${contentLabel}</button>`;
                    html += `<div class="content">`;
                    if (content.text) {
                        html += `<pre>${escapeHtml(content.text)}</pre>`;
                    } else if (typeof content === 'object') {
                        html += `<pre>${escapeHtml(JSON.stringify(content, null, 2))}</pre>`;
                    }
                    html += `</div>`;
                });
            } else {
                html += '<p>Empty content</p>';
            }
            
            // For assistant messages, also display tool calls if present
            if (role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
                html += '<div class="tool-section">';
                html += '<strong>Tool Calls:</strong>';
                html += '<ul>';
                
                message.tool_calls.forEach(toolCall => {
                    html += '<li>';
                    html += `<span class="tool-name">${toolCall.function?.name || 'Unknown Tool'}</span>`;
                    if (toolCall.function?.arguments) {
                        html += `<pre>${escapeHtml(toolCall.function.arguments)}</pre>`;
                    }
                    html += '</li>';
                });
                
                html += '</ul>';
                html += '</div>';
            }
            
            html += '</li>';
        });
        
        html += '</ul>';
    } else {
        html += '<p>No request messages</p>';
    }
    
    html += '</div>'; // End of content div
    html += '</div>'; // End of messages section
    
    // Render request options section
    html += '<div class="tool-section">';
    html += '<button class="collapsible">Request Options</button>';
    html += '<div class="content">';
    
    if (request.requestOptions) {
        // Display only tool names instead of full tools objects
        if (request.requestOptions.tools && request.requestOptions.tools.length > 0) {
            html += '<strong>Tools:</strong>';
            html += '<ul>';
            
            request.requestOptions.tools.forEach(tool => {
                const toolName = tool.function?.name || 'Unknown Tool';
                html += `<li>${toolName}</li>`;
            });
            
            html += '</ul>';
        }
        
        // Display other request options
        const { tools, ...otherOptions } = request.requestOptions;
        html += `<pre>${escapeHtml(JSON.stringify(otherOptions, null, 2))}</pre>`;
    } else {
        html += '<p>No request options</p>';
    }
    
    html += '</div>'; // End of content div
    html += '</div>'; // End of tool section
    
    // Render response section
    html += '<div class="response-section">';
    html += '<button class="collapsible">Response</button>';
    html += '<div class="content">';
    
    if (request.response) {
        if (request.response.value && request.response.value.length > 0) {
            html += '<strong>Response Text:</strong>';
            
            // Check if this is a replace_string_in_file function call and format JSON accordingly
            const hasReplaceStringCall = request.response.copilotFunctionCalls && 
                request.response.copilotFunctionCalls.some(call => call.name === 'replace_string_in_file');
            
            if (hasReplaceStringCall) {
                // Try to format as JSON if it's a replace_string_in_file response
                const responseText = request.response.value.join('\n');
                try {
                    const jsonData = JSON.parse(responseText);
                    html += `<pre>${escapeHtml(JSON.stringify(jsonData, null, 2))}</pre>`;
                } catch(e) {
                    // If not valid JSON, display as regular text
                    html += `<pre>${escapeHtml(responseText)}</pre>`;
                }
            } else {
                // Regular response display for other function calls
                html += `<pre>${escapeHtml(request.response.value.join('\n'))}</pre>`;
            }
        }
        
        if (request.response.copilotFunctionCalls && request.response.copilotFunctionCalls.length > 0) {
            html += '<strong>Function Calls:</strong>';
            html += '<ul>';
            
            request.response.copilotFunctionCalls.forEach((call, callIndex) => {
                // Check if this function call should be highlighted
                const isHighlighted = highlightFunctionCallIndex === callIndex;
                const highlightStyle = isHighlighted ? 'background-color: #fff3cd; border: 2px solid #856404; border-radius: 4px; padding: 5px;' : '';
                
                html += `<li style="${highlightStyle}">`;
                html += `<span class="tool-name">${call.name || 'Unknown Function'}</span>`;
                if (isHighlighted) {
                    html += ' <span style="color: #856404; font-weight: bold;">← Selected</span>';
                }
                
                // Add format button for replace_string_in_file calls
                if (call.name === 'replace_string_in_file') {
                    html += `<br>
                        <button class="format-button" onclick="toggleDiffView(${callIndex}, ${index})" 
                                id="diff-btn-${index}-${callIndex}" 
                                title="Toggle between diff and raw view">📝 View Diff</button>
                        <button class="format-button" onclick="toggleRawView(${callIndex}, ${index})" 
                                id="raw-btn-${index}-${callIndex}" 
                                title="Show raw JSON arguments" 
                                style="margin-left: 5px; background-color: #17a2b8;">📋 View Raw</button>`;
                }
                
                if (call.arguments) {
                    html += `<pre id="function-args-${index}-${callIndex}">${escapeHtml(call.arguments)}</pre>`;
                }
                html += '</li>';
            });
            
            html += '</ul>';
        }
        
        // Display usage info if available
        if (request.response.usage) {
            html += '<strong>Usage:</strong>';
            html += `<pre>${escapeHtml(JSON.stringify(request.response.usage, null, 2))}</pre>`;
        }
    } else {
        html += '<p>No response data</p>';
    }
    
    html += '</div>'; // End of content div
    html += '</div>'; // End of response section
    
    container.innerHTML = html;
    
    // Add click event listeners to all collapsible elements
    const collapsibles = document.getElementsByClassName('collapsible');
    for (let i = 0; i < collapsibles.length; i++) {
        collapsibles[i].addEventListener('click', function() {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            
            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                content.style.maxHeight = '0';
            } else {
                content.classList.add('expanded');
                // For expanded content, allow natural height with scrolling
                content.style.maxHeight = 'none';
            }
        });
        
        // Handle main sections - Request Messages and Response open by default, Request Options closed
        const isMainSection = collapsibles[i].textContent.includes('Request Messages') || 
                             collapsibles[i].textContent.includes('Response');
        
        if (isMainSection) {
            collapsibles[i].classList.add('active');
            const content = collapsibles[i].nextElementSibling;
            content.classList.add('expanded');
            content.style.maxHeight = 'none';
        }
        // Request Options and content sections within messages remain collapsed by default (no action needed)
    }
}

function escapeHtml(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Function to copy raw request and response data to clipboard
function copyRawRequestResponse(index) {
    const request = requests[index];
    const button = event.target.closest('.copy-raw-button');
    const tooltip = button.querySelector('.copy-tooltip');
    
    // Create a clean copy of the request data
    const rawData = {
        requestIndex: index + 1,
        requestId: request.response?.requestId || 'N/A',
        model: request.model || 'Unknown',
        requestMessages: request.requestMessages || [],
        requestOptions: request.requestOptions || {},
        response: request.response || {}
    };
    
    // Convert to formatted JSON
    const jsonString = JSON.stringify(rawData, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(jsonString).then(() => {
        // Success feedback
        const originalText = button.innerHTML;
        const originalBg = button.style.backgroundColor;
        
        button.innerHTML = '✅ Copied!';
        button.classList.add('copied');
        tooltip.textContent = 'Copied to clipboard!';
        tooltip.classList.add('show');
        
        // Reset after 2 seconds
        setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove('copied');
            tooltip.textContent = 'Click to copy raw JSON';
            tooltip.classList.remove('show');
        }, 2000);
        
    }).catch(err => {
        // Fallback for older browsers or when clipboard API fails
        console.error('Failed to copy to clipboard:', err);
        
        // Create a temporary textarea to select and copy the text
        const textarea = document.createElement('textarea');
        textarea.value = jsonString;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            
            // Success feedback
            const originalText = button.innerHTML;
            button.innerHTML = '✅ Copied!';
            button.classList.add('copied');
            tooltip.textContent = 'Copied to clipboard!';
            tooltip.classList.add('show');
            
            setTimeout(() => {
                tooltip.classList.remove('show');
            }, 2000);
            
        } catch (err2) {
            console.error('Fallback copy also failed:', err2);
            
            // Show error feedback
            button.innerHTML = '❌ Copy Failed';
            tooltip.textContent = 'Copy failed - check console';
            tooltip.classList.add('show');
            
            setTimeout(() => {
                tooltip.classList.remove('show');
            }, 2000);
        }
        
        document.body.removeChild(textarea);
    });
}

// Function to format replace_string_in_file diff view
function formatReplaceStringDiff(callIndex, requestIndex) {
    const request = requests[requestIndex];
    const functionCall = request.response.copilotFunctionCalls[callIndex];
    
    if (functionCall.name !== 'replace_string_in_file') {
        return;
    }
    
    try {
        // Parse the function arguments
        const args = typeof functionCall.arguments === 'string' 
            ? JSON.parse(functionCall.arguments) 
            : functionCall.arguments;
        
        const { oldString, newString, filePath } = args;
        
        if (!oldString || !newString) {
            alert('Missing oldString or newString in function arguments');
            return;
        }
        
        // Create the diff view HTML
        const diffHtml = `
            <div class="diff-container">
                <div class="diff-header">
                    <span class="file-path">${filePath}</span>
                </div>
                <div class="diff-section diff-old">
                    <h4>− Removed</h4>
                    <div class="diff-content">${escapeHtml(oldString)}</div>
                </div>
                <div class="diff-section diff-new">
                    <h4>+ Added</h4>
                    <div class="diff-content">${escapeHtml(newString)}</div>
                </div>
            </div>
        `;
        
        // Replace the function arguments with the formatted diff
        const preElement = document.getElementById(`function-args-${requestIndex}-${callIndex}`);
        if (preElement) {
            preElement.innerHTML = diffHtml;
        }
        
        // Update the button to show it's been formatted
        const button = event.target;
        button.textContent = '✅ Diff View';
        button.style.backgroundColor = '#28a745';
        button.disabled = true;
        button.title = 'Diff view is now active';
        
    } catch (error) {
        console.error('Error parsing replace_string_in_file arguments:', error);
        alert('Error parsing function arguments. Please check the format.');
    }
}

// Function to toggle between diff view and raw view for replace_string_in_file
function toggleDiffView(callIndex, requestIndex) {
    const preElement = document.getElementById(`function-args-${requestIndex}-${callIndex}`);
    const diffButton = document.getElementById(`diff-btn-${requestIndex}-${callIndex}`);
    const rawButton = document.getElementById(`raw-btn-${requestIndex}-${callIndex}`);
    
    if (!preElement || !diffButton) return;
    
    const request = requests[requestIndex];
    const functionCall = request.response.copilotFunctionCalls[callIndex];
    
    if (functionCall.name !== 'replace_string_in_file') {
        return;
    }
    
    // Check current state
    const isDiffView = preElement.querySelector('.diff-container') !== null;
    
    if (isDiffView) {
        // Switch to raw view
        showRawView(callIndex, requestIndex);
    } else {
        // Switch to diff view
        showDiffView(callIndex, requestIndex);
    }
}

// Function to toggle between raw view and diff view for replace_string_in_file
function toggleRawView(callIndex, requestIndex) {
    const preElement = document.getElementById(`function-args-${requestIndex}-${callIndex}`);
    const diffButton = document.getElementById(`diff-btn-${requestIndex}-${callIndex}`);
    const rawButton = document.getElementById(`raw-btn-${requestIndex}-${callIndex}`);
    
    if (!preElement || !rawButton) return;
    
    const request = requests[requestIndex];
    const functionCall = request.response.copilotFunctionCalls[callIndex];
    
    if (functionCall.name !== 'replace_string_in_file') {
        return;
    }
    
    // Check current state
    const isDiffView = preElement.querySelector('.diff-container') !== null;
    
    if (isDiffView) {
        showRawView(callIndex, requestIndex);
    } else {
        // Already in raw view - show diff view instead
        showDiffView(callIndex, requestIndex);
    }
}

// Function to show diff view
function showDiffView(callIndex, requestIndex) {
    const request = requests[requestIndex];
    const functionCall = request.response.copilotFunctionCalls[callIndex];
    const preElement = document.getElementById(`function-args-${requestIndex}-${callIndex}`);
    const diffButton = document.getElementById(`diff-btn-${requestIndex}-${callIndex}`);
    const rawButton = document.getElementById(`raw-btn-${requestIndex}-${callIndex}`);
    
    try {
        // Parse the function arguments
        const args = typeof functionCall.arguments === 'string' 
            ? JSON.parse(functionCall.arguments) 
            : functionCall.arguments;
        
        const { oldString, newString, filePath } = args;
        
        if (!oldString || !newString) {
            alert('Missing oldString or newString in function arguments');
            return;
        }
        
        // Create the diff view HTML
        const diffHtml = `
            <div class="diff-container">
                <div class="diff-header">
                    <span class="file-path">${filePath}</span>
                </div>
                <div class="diff-section diff-old">
                    <h4>− Removed</h4>
                    <div class="diff-content">${escapeHtml(oldString)}</div>
                </div>
                <div class="diff-section diff-new">
                    <h4>+ Added</h4>
                    <div class="diff-content">${escapeHtml(newString)}</div>
                </div>
            </div>
        `;
        
        // Replace the function arguments with the formatted diff
        preElement.innerHTML = diffHtml;
        
        // Update button states
        diffButton.textContent = '📝 Diff View';
        diffButton.style.backgroundColor = '#28a745';
        diffButton.disabled = false;
        diffButton.title = 'Diff view is active - click to switch to raw';
        
        rawButton.textContent = '📋 View Raw';
        rawButton.style.backgroundColor = '#17a2b8';
        rawButton.disabled = false;
        rawButton.title = 'Switch to raw JSON view';
        
    } catch (error) {
        console.error('Error parsing replace_string_in_file arguments:', error);
        alert('Error parsing function arguments. Please check the format.');
    }
}

// Function to show raw view
function showRawView(callIndex, requestIndex) {
    const request = requests[requestIndex];
    const functionCall = request.response.copilotFunctionCalls[callIndex];
    const preElement = document.getElementById(`function-args-${requestIndex}-${callIndex}`);
    const diffButton = document.getElementById(`diff-btn-${requestIndex}-${callIndex}`);
    const rawButton = document.getElementById(`raw-btn-${requestIndex}-${callIndex}`);
    
    // Show the raw function arguments
    preElement.innerHTML = escapeHtml(functionCall.arguments);
    
    // Update button states
    diffButton.textContent = '📝 View Diff';
    diffButton.style.backgroundColor = '#17a2b8';
    diffButton.disabled = false;
    diffButton.title = 'Switch to diff view';
    
    rawButton.textContent = '📋 Raw View';
    rawButton.style.backgroundColor = '#28a745';
    rawButton.disabled = false;
    rawButton.title = 'Raw view is active - click to switch to diff';
}

// Function to show diff view
function showDiffView(callIndex, requestIndex) {
    const request = requests[requestIndex];
    const functionCall = request.response.copilotFunctionCalls[callIndex];
    const preElement = document.getElementById(`function-args-${requestIndex}-${callIndex}`);
    const diffButton = document.getElementById(`diff-btn-${requestIndex}-${callIndex}`);
    const rawButton = document.getElementById(`raw-btn-${requestIndex}-${callIndex}`);
    
    try {
        // Parse the function arguments
        const args = typeof functionCall.arguments === 'string' 
            ? JSON.parse(functionCall.arguments) 
            : functionCall.arguments;
        
        const { oldString, newString, filePath } = args;
        
        if (!oldString || !newString) {
            alert('Missing oldString or newString in function arguments');
            return;
        }
        
        // Create the diff view HTML
        const diffHtml = `
            <div class="diff-container">
                <div class="diff-header">File Changes</div>
                ${filePath ? `<div style="padding: 8px 12px;"><span class="file-path">${escapeHtml(filePath)}</span></div>` : ''}
                
                <div class="diff-section diff-old">
                    <h4>🔴 Removed Content</h4>
                    <div class="diff-content">${escapeHtml(oldString)}</div>
                </div>
                
                <div class="diff-section diff-new">
                    <h4>🟢 Added Content</h4>
                    <div class="diff-content">${escapeHtml(newString)}</div>
                </div>
            </div>
        `;
        
        // Replace the function arguments with the formatted diff
        if (preElement) {
            preElement.innerHTML = diffHtml;
            preElement.style.background = 'transparent';
            preElement.style.border = 'none';
            preElement.style.padding = '0';
        }
        
        // Update button states
        if (diffButton) {
            diffButton.textContent = '✅ Diff View';
            diffButton.style.backgroundColor = '#28a745';
            diffButton.title = 'Currently showing diff view - click to switch to raw';
        }
        
        if (rawButton) {
            rawButton.textContent = '📋 Raw View';
            rawButton.style.backgroundColor = '#17a2b8';
            rawButton.title = 'Switch to raw JSON view';
        }
        
    } catch (error) {
        console.error('Failed to create diff view:', error);
        alert('Failed to parse function arguments for diff view: ' + error.message);
    }
}


