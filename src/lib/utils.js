// Utility helpers reused by components & stores

export function parseJSONSafe(str) {
  try { return JSON.parse(str); } catch { return null; }
}

export function parseJSONStrict(str) {
  return JSON.parse(str);
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
