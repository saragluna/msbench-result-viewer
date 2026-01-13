// Utility helpers reused by components & stores

export function parseJSONSafe(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function normalizeMultilineString(value) {
  if (typeof value !== 'string') return '';
  let out = value.replace(/^\uFEFF/, '');
  // If a tool returns a JSON-ish string where newlines are double-escaped (\\n),
  // convert them back to real newlines for readable diffs.
  if (out.includes('\\r\\n') && !out.includes('\n')) out = out.replace(/\\r\\n/g, '\n');
  if (out.includes('\\n') && !out.includes('\n')) out = out.replace(/\\n/g, '\n');
  return out;
}

// Extract { filePath, oldString, newString } from replace_string_in_file tool payloads.
// Handles payloads arriving as:
// - object
// - JSON string
// - double-encoded JSON string (a JSON string whose contents are JSON)
// - text that contains a JSON object somewhere within it
export function parseReplaceStringPayload(input) {
  const coerceObject = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    if (typeof val !== 'string') return null;

    const trimmed = val.trim();
    if (!trimmed) return null;

    // 1) Direct parse
    let parsed = parseJSONSafe(trimmed);

    // 2) Double-encoded JSON (parsed is a string containing JSON)
    if (typeof parsed === 'string') {
      const parsed2 = parseJSONSafe(parsed.trim());
      if (parsed2 && typeof parsed2 === 'object') return parsed2;
    }
    if (parsed && typeof parsed === 'object') return parsed;

    // 3) Embedded JSON object
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const slice = trimmed.slice(first, last + 1);
      parsed = parseJSONSafe(slice);
      if (parsed && typeof parsed === 'object') return parsed;
    }

    return null;
  };

  const obj = coerceObject(input);
  if (!obj) return null;

  const filePath = obj.filePath || obj.path || obj.file || obj.filename;
  const oldString = obj.oldString ?? obj.old ?? obj.before;
  const newString = obj.newString ?? obj.new ?? obj.after;

  if (typeof oldString !== 'string' && typeof newString !== 'string') return null;

  return {
    filePath,
    oldString: normalizeMultilineString(oldString),
    newString: normalizeMultilineString(newString)
  };
}

// Extract { explanation, replacements: [{ filePath, oldString, newString, explanation? }, ...] }
// from multi_replace_string_in_file payloads.
export function parseMultiReplaceStringPayload(input) {
  const coerceObject = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    if (typeof val !== 'string') return null;

    const trimmed = val.trim();
    if (!trimmed) return null;

    let parsed = parseJSONSafe(trimmed);
    if (typeof parsed === 'string') {
      const parsed2 = parseJSONSafe(parsed.trim());
      if (parsed2 && typeof parsed2 === 'object') return parsed2;
    }
    if (parsed && typeof parsed === 'object') return parsed;

    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const slice = trimmed.slice(first, last + 1);
      parsed = parseJSONSafe(slice);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    return null;
  };

  const obj = coerceObject(input);
  if (!obj) return null;

  const replacementsRaw = Array.isArray(obj.replacements) ? obj.replacements : null;
  if (!replacementsRaw || replacementsRaw.length === 0) return null;

  const replacements = replacementsRaw
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const filePath = r.filePath || r.path || r.file || r.filename;
      const oldString = r.oldString ?? r.old ?? r.before;
      const newString = r.newString ?? r.new ?? r.after;
      if (typeof oldString !== 'string' && typeof newString !== 'string') return null;
      const explanation = typeof r.explanation === 'string' ? r.explanation : '';
      return {
        filePath,
        oldString: normalizeMultilineString(oldString),
        newString: normalizeMultilineString(newString),
        explanation
      };
    })
    .filter(Boolean);

  if (!replacements.length) return null;

  return {
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
    replacements
  };
}

export function formatMultiReplaceDiff(payload) {
  const replacements = payload?.replacements;
  if (!Array.isArray(replacements) || replacements.length === 0) return '<pre>Invalid diff</pre>';

  const header = payload?.explanation ? `<div class="diff-header">${escapeHtml(payload.explanation)}</div>` : '';
  const items = replacements
    .map((r, idx) => {
      const title = r?.filePath ? escapeHtml(r.filePath) : `Replacement ${idx + 1}`;
      const note = r?.explanation ? `<div class="diff-note">${escapeHtml(r.explanation)}</div>` : '';
      return `\n<div class="diff-container">\n  <div class="diff-header">${title}</div>\n  ${note}\n  <div class="diff-section diff-old">\n    <h4>− Removed</h4>\n    <div class="diff-content">${escapeHtml(r?.oldString || '')}</div>\n  </div>\n  <div class="diff-section diff-new">\n    <h4>+ Added</h4>\n    <div class="diff-content">${escapeHtml(r?.newString || '')}</div>\n  </div>\n</div>`;
    })
    .join('\n');

  if (!header) return items;
  return `\n<div class="diff-container">${header}</div>\n${items}`;
}

// Extract { operation, todoList } from manage_todo_list payloads.
// Supports object, JSON string, double-encoded JSON, and embedded JSON.
export function parseManageTodoListPayload(input) {
  const coerceObject = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    if (typeof val !== 'string') return null;

    const trimmed = val.trim();
    if (!trimmed) return null;

    let parsed = parseJSONSafe(trimmed);
    if (typeof parsed === 'string') {
      const parsed2 = parseJSONSafe(parsed.trim());
      if (parsed2 && typeof parsed2 === 'object') return parsed2;
    }
    if (parsed && typeof parsed === 'object') return parsed;

    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const slice = trimmed.slice(first, last + 1);
      parsed = parseJSONSafe(slice);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    return null;
  };

  const obj = coerceObject(input);
  if (!obj) return null;

  const todoList = Array.isArray(obj.todoList) ? obj.todoList : null;
  if (!todoList) return null;

  return {
    operation: obj.operation,
    todoList: todoList
      .map((t) => {
        if (!t || typeof t !== 'object') return null;
        return {
          id: t.id,
          title: t.title || '',
          description: t.description || '',
          status: t.status || ''
        };
      })
      .filter(Boolean)
  };
}

export function formatTodoListHtml(payload) {
  const items = payload?.todoList;
  if (!Array.isArray(items)) return null;

  const headerText = payload?.operation ? `Todo List (${String(payload.operation)})` : 'Todo List';

  const lines = items
    .map((t) => {
      const status = (t.status || '').toLowerCase();
      const cls = status || 'unknown';
      const marker = status === 'completed' ? 'x' : (status === 'in-progress' ? '-' : ' ');
      const title = escapeHtml(t.title || '');
      const desc = (t.description || '').trim();
      const descHtml = desc ? `<div class="todo-desc">${escapeHtml(desc)}</div>` : '';
      const idPrefix = (t.id !== undefined && t.id !== null) ? `<span class="todo-id">${escapeHtml(String(t.id))}.</span> ` : '';
      return `
        <div class="todo-item ${cls}">
          <div class="todo-line">
            <span class="todo-box" aria-hidden="true">[${marker}]</span>
            <span class="todo-title">${idPrefix}${title}</span>
          </div>
          ${descHtml}
        </div>`;
    })
    .join('\n');

  return `
    <div class="todo-container">
      <div class="diff-container">
        <div class="diff-header">${escapeHtml(headerText)}</div>
      </div>
      <div class="todo-body">${lines}</div>
    </div>`;
}

export function safeArray(v) { return Array.isArray(v) ? v : []; }

export function hashColor(name) {
  if (name === 'None') return '#6c757d';
  // Expanded color palette with more distinct colors for different tools
  const colors = [
    '#007bff', // Blue
    '#28a745', // Green  
    '#dc3545', // Red
    '#ffc107', // Yellow/Orange
    '#17a2b8', // Teal
    '#6f42c1', // Purple
    '#fd7e14', // Orange
    '#20c997', // Mint
    '#e83e8c', // Pink
    '#343a40', // Dark Gray
    '#495057', // Gray
    '#6610f2', // Indigo
    '#e74c3c', // Light Red
    '#3498db', // Light Blue
    '#2ecc71', // Light Green
    '#f39c12', // Orange
    '#9b59b6', // Light Purple
    '#1abc9c', // Turquoise
    '#34495e', // Dark Blue Gray
    '#95a5a6', // Light Gray
    '#f1c40f', // Bright Yellow
    '#e67e22', // Dark Orange
    '#8e44ad', // Dark Purple
    '#16a085', // Dark Turquoise
    '#2c3e50', // Navy
    '#c0392b', // Dark Red
    '#d35400', // Burnt Orange
    '#7f8c8d', // Medium Gray
    '#27ae60', // Forest Green
    '#2980b9', // Ocean Blue
  ];
  let h = 0;
  for (let i=0;i<name.length;i++) { h = (h<<5) - h + name.charCodeAt(i); h|=0; }
  return colors[Math.abs(h)%colors.length];
}

export function formatReplaceDiff(args) {
  const { oldString, newString, filePath } = args || {};
  if (!oldString && !newString) return '<pre>Invalid diff</pre>';
  return `\n<div class="diff-container">\n  <div class="diff-header">${filePath || 'File Changes'}</div>\n  <div class="diff-section diff-old">\n    <h4>− Removed</h4>\n    <div class="diff-content">${escapeHtml(oldString||'')}</div>\n  </div>\n  <div class="diff-section diff-new">\n    <h4>+ Added</h4>\n    <div class="diff-content">${escapeHtml(newString||'')}</div>\n  </div>\n</div>`;
}

export function escapeHtml(text='') {
  return text.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
}
