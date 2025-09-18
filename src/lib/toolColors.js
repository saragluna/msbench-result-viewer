// System tool list (can be modified later)
export const SYSTEM_TOOLS = [
  'apply_patch',
  'create_directory',
  'create_file',
  'create_new_jupyter_notebook',
  'edit_notebook_file',
  'file_search',
  'test_search',
  'grep_search',
  'get_changed_files',
  'copilot_getNotebookSummary',
  'get_search_view_results',
  'get_vscode_api',
  'github_repo',
  'list_code_usages',
  'list_dir',
  'open_simple_browser',
  'read_file',
  'run_notebook_cell',
  'semantic_search',
  'test_failure',
  'create_and_run_task',
  'get_terminal_output',
  'manage_todo_list',
  'run_in_terminal',
  'terminal_last_command',
  'terminal_selection',
  'insert_edit_into_file'
];

// Subset: tools that can modify files / filesystem (or execute arbitrary changes)
// User-specified current modifiable tools subset (file / content mutators)
export const MODIFIABLE_TOOLS = [
  'replace_string_in_file',
  'apply_patch',
  'edit_file',
  'create_file',
  'create_directory',
  'run_in_terminal'
];

// Warm (red-like but not red) palette for modifiable tools (no pure reds)
const WARM_PALETTE = [
  '#f97316', // orange
  '#ea580c', // deep orange
  '#fb923c', // light orange
  '#d97706', // amber-brown
  '#f59e0b', // amber
  '#c2410c', // burnt orange (not red)
  '#f8b400', // golden
  '#ffb454'  // soft amber
];

// Blue-like palette for non-modifiable system tools
const BLUE_PALETTE = [
  '#1d4ed8', '#2563eb', '#3b82f6', '#0ea5e9', '#38bdf8', '#1e40af', '#1e3a8a', '#60a5fa', '#0284c7'
];

// Green-like palette for tools NOT in the predefined system list (user / external)
const GREEN_PALETTE = [
  '#047857', // emerald deep
  '#059669', // emerald
  '#10b981', // green
  '#34d399', // light green
  '#16a34a', // vibrant green
  '#0d9488', // teal green
  '#14b8a6', // teal
  '#22c55e', // lime-ish green
  '#2dd4bf'  // aqua green
];

// Deterministic simple hash
function simpleHash(str) {
  let h = 0; for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0; return Math.abs(h);
}

// Build color map lazily so later modifications to arrays can be reflected by rebuilding if needed.
let _COLOR_CACHE = null;
function buildColorMap() {
  if (_COLOR_CACHE) return _COLOR_CACHE;
  const map = {};
  // Assign warm colors to modifiable tools
  MODIFIABLE_TOOLS.forEach((t, i) => { map[t] = WARM_PALETTE[i % WARM_PALETTE.length]; });
  // Remaining system tools get blue-like colors
  SYSTEM_TOOLS.filter(t => !map[t]).forEach((t, i) => { map[t] = BLUE_PALETTE[i % BLUE_PALETTE.length]; });
  // Explicit overrides to avoid similar hues for high-frequency tools
  // Ensure read_file differs from grep_search if collision occurs
  if (map['grep_search'] && map['read_file'] && map['grep_search'] === map['read_file']) {
    // Pick a distinct blue-teal not in the immediate BLUE_PALETTE cycle
    map['read_file'] = '#0f7497'; // contrasting cyan-blue
  }
  _COLOR_CACHE = map;
  return map;
}

export function colorForTool(name) {
  if (!name) return '#6b7280';
  if (name === 'None') return '#000000'; // explicit per latest requirement
  const key = String(name).trim();
  const lower = key.toLowerCase();
  const map = buildColorMap();
  if (map[key]) return map[key];
  if (map[lower]) return map[lower];
  // Fallback: choose from green palette for unknown tools
  return GREEN_PALETTE[simpleHash(lower) % GREEN_PALETTE.length];
}

export const SYSTEM_TOOL_COLORS = buildColorMap();
