<script>
  import { formatReplaceDiff, formatMultiReplaceDiff, formatTodoListHtml, parseJSONSafe } from '../lib/utils.js';
  export let call;

  // view modes:
  //  diff       - show visual diff for replace_string_in_file
  //  formatted  - show pretty file content for create_file
  //  raw        - show raw JSON args
  //  auto       - (not currently differentiated but kept for possible future heuristics)
  // Default view mode; will auto-upgrade to diff/formatted for specific tool types
  let view = 'auto';

  // Handle both sim-requests format (call.arguments) and fetchlog format (call.function.arguments)
  $: rawArguments = call?.arguments ?? call?.function?.arguments;
  $: toolName = call?.name ?? call?.function?.name;
  
  $: parsedArgs = typeof rawArguments === 'string' ? parseJSONSafe(rawArguments) : rawArguments;
  $: isReplace = toolName === 'replace_string_in_file';
  $: isMultiReplace = toolName === 'multi_replace_string_in_file';
  $: isManageTodoList = toolName === 'manage_todo_list';
  $: isCreateFile = toolName === 'create_file';
  $: isApplyPatch = toolName === 'apply_patch';

  // Extract raw patch text for apply_patch
  $: patchText = (() => {
    if (!isApplyPatch) return '';
    if (parsedArgs && typeof parsedArgs === 'object') {
      // Common parameter names: patch, input, diff
      return parsedArgs.patch || parsedArgs.input || parsedArgs.diff || '';
    }
    if (typeof rawArguments === 'string') {
      const p = parseJSONSafe(rawArguments);
      if (p && typeof p === 'object') return p.patch || p.input || p.diff || '';
      // If arguments is already the patch block string
      if (/\*\*\* Begin Patch/.test(rawArguments)) return rawArguments;
    }
    return '';
  })();

  // Parse patch into file blocks
  function parsePatchBlocks(text) {
    if (!text) return [];
    const beginIdx = text.indexOf('*** Begin Patch');
    const endIdx = text.indexOf('*** End Patch');
    if (beginIdx !== -1 && endIdx !== -1) {
      text = text.slice(beginIdx + '*** Begin Patch'.length, endIdx).trim();
    }
    const lines = text.split(/\r?\n/);
    const fileHeader = /^\*\*\* (Update|Add|Delete) File: (.+)$/;
    const blocks = [];
    let current = null;
    for (const line of lines) {
      const m = line.match(fileHeader);
      if (m) {
        if (current) blocks.push(current);
        current = { action: m[1], filePath: m[2].trim(), body: [] };
      } else if (current) {
        current.body.push(line);
      }
    }
    if (current) blocks.push(current);
    return blocks.map(b => ({ ...b, body: b.body.join('\n').replace(/^[\n\r]+|[\n\r]+$/g, '') }));
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function highlightPatchBody(body) {
    if (!body) return '';
    return body.split(/\n/).map(line => {
      const esc = escapeHtml(line) || '&nbsp;';
      let cls = 'ctx';
      if (line.startsWith('+')) cls = 'add';
      else if (line.startsWith('-')) cls = 'del';
      else if (line.startsWith('@@')) cls = 'hunk';
      return `<span class="pl ${cls}">${esc}</span>`;
    }).join('\n');
  }

  $: patchBlocks = isApplyPatch ? parsePatchBlocks(patchText) : [];
  $: formattedArgs = (() => {
    try {
      if (parsedArgs && typeof parsedArgs === 'object') return JSON.stringify(parsedArgs, null, 2);
      if (typeof rawArguments === 'string') {
        const attempt = parseJSONSafe(rawArguments);
        if (attempt && typeof attempt === 'object') return JSON.stringify(attempt, null, 2);
        return rawArguments; // plain string
      }
      if (rawArguments !== undefined) return JSON.stringify(rawArguments, null, 2);
      return '';
    } catch { return typeof rawArguments === 'string' ? rawArguments : ''; }
  })();

  // Auto-select a richer default visualization the first time we see these tools
  $: if (view === 'auto') {
    if (isReplace && parsedArgs?.oldString) {
      view = 'diff';
    } else if (isMultiReplace && Array.isArray(parsedArgs?.replacements) && parsedArgs.replacements.length) {
      view = 'diff';
    } else if (isManageTodoList && Array.isArray(parsedArgs?.todoList)) {
      view = 'todo';
    } else if (isCreateFile && parsedArgs?.content !== undefined) {
      view = 'formatted';
    } else if (isApplyPatch && patchBlocks.length) {
      view = 'patch';
    }
  }

  function toggleDiff () { view = view === 'diff' ? 'raw' : 'diff'; }
  function toggleTodo () { view = view === 'todo' ? 'raw' : 'todo'; }
  function toggleFormatted () { view = view === 'formatted' ? 'raw' : 'formatted'; }
  function togglePatch () { view = view === 'patch' ? 'raw' : 'patch'; }
</script>

<div class="fn-args">
  {#if isReplace || isMultiReplace}
    <div class="actions"><button on:click={toggleDiff}>{view === 'diff' ? 'Raw JSON' : 'View Diff'}</button></div>
    {#if view === 'diff' && (parsedArgs?.oldString || (Array.isArray(parsedArgs?.replacements) && parsedArgs.replacements.length))}
      <div class="diff-wrapper" aria-label="Replace diff view">
        {@html isMultiReplace ? formatMultiReplaceDiff(parsedArgs) : formatReplaceDiff(parsedArgs)}
      </div>
    {:else}
      <pre>{formattedArgs}</pre>
    {/if}
  {:else if isCreateFile}
    <div class="actions"><button on:click={toggleFormatted}>{view === 'formatted' ? 'Raw JSON' : 'Formatted'}</button></div>
    {#if view === 'formatted' && parsedArgs?.content !== undefined}
      <div class="file-view">
        <div class="file-head"><span class="path">{parsedArgs.filePath}</span></div>
        <pre>{parsedArgs.content}</pre>
      </div>
    {:else}
      <pre>{formattedArgs}</pre>
    {/if}
  {:else if isApplyPatch}
    <div class="actions"><button on:click={togglePatch}>{view === 'patch' ? 'Raw JSON' : 'Patch View'}</button></div>
    {#if view === 'patch' && patchBlocks.length}
      <div class="patch-view" aria-label="Apply patch visualization">
        {#each patchBlocks as blk, bi}
          <div class="patch-file" data-action={blk.action} data-idx={bi}>
            <div class="patch-head">
              <span class="patch-path" title={blk.filePath}><span class="patch-action-text">{blk.action}:</span> {blk.filePath}</span>
            </div>
            {#if blk.action === 'Delete'}
              <div class="patch-deleted-note">File deleted</div>
            {:else if blk.body}
              <pre class="patch-code" aria-label={blk.action + ' file diff'}>{@html highlightPatchBody(blk.body)}</pre>
            {:else}
              <div class="patch-empty">(No content changes captured)</div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <pre>{formattedArgs}</pre>
    {/if}
  {:else}
    {#if isManageTodoList}
      <div class="actions"><button on:click={toggleTodo}>{view === 'todo' ? 'Raw JSON' : 'Todo View'}</button></div>
      {#if view === 'todo' && Array.isArray(parsedArgs?.todoList)}
        <div class="todo-wrapper" aria-label="Todo list view">{@html formatTodoListHtml(parsedArgs)}</div>
      {:else}
        <pre>{formattedArgs}</pre>
      {/if}
    {:else}
      <pre>{formattedArgs}</pre>
    {/if}
  {/if}
</div>

<style>
.actions { margin-bottom:4px; }
.actions button { background:#17a2b8; color:#fff; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:.75rem; }
.actions button:hover { background:#138496; }
.file-view { background:#f8f9fa; border:1px solid #dee2e6; border-radius:6px; }
.file-head { background:#e9ecef; padding:6px 10px; font-weight:600; font-size:.8rem; }
.path { background:#6f42c1; color:#fff; padding:3px 8px; border-radius:3px; font-size:.7rem; }
/* Diff HTML (injected) styles */
:global(.diff-container) { background:#f8f9fa; border:1px solid #dee2e6; border-radius:6px; }
:global(.diff-header) { background: var(--color-accent); color:#fff; padding:8px 12px; border-bottom:1px solid rgba(0,0,0,0.08); font-weight:600; font-size:.7rem; letter-spacing:0; text-transform:none; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; overflow-wrap:anywhere; word-break:break-word; white-space:normal; }
:global(.diff-section h4) { margin:0; padding:6px 10px; font-size:.8rem; }
:global(.diff-old) { background:#f8d7da; border-left:4px solid #dc3545; }
:global(.diff-old h4) { color:#721c24; background:#f5c6cb; }
:global(.diff-new) { background:#d4edda; border-left:4px solid #28a745; }
:global(.diff-new h4) { color:#155724; background:#c3e6cb; }
:global(.diff-content) { padding:10px; font-family:monospace; font-size:.75rem; line-height:1.4; white-space:pre-wrap; overflow:auto; max-height:250px; }
:global(.diff-note) { padding:6px 10px; font-size:.72rem; color:#495057; border-bottom:1px solid #dee2e6; background:#fff; }

/* Apply Patch visualization */
.patch-view { display:flex; flex-direction:column; gap:10px; }
.patch-file { border:1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); box-shadow: var(--shadow-sm); overflow:hidden; }
.patch-head {
  display:flex;
  flex-wrap: wrap;
  align-items:flex-start;
  gap:8px;
  padding:8px 12px;
  background: var(--color-accent);
  color:#fff;
  border-bottom:1px solid rgba(0,0,0,0.08);
  font-weight:600;
  font-size:.7rem;
  font-family: var(--font-mono);
}
.patch-action-text { font-weight:800; }
.patch-path {
  flex: 1 1 auto;
  min-width: 240px;
  font-family: var(--font-mono);
  font-size: .7rem;
  color:#fff;
  padding: 0;
  border-radius: 0;
  background: transparent;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}
.patch-code { background:#fff; margin:0; padding:8px 10px; font-family:monospace; font-size:.68rem; line-height:1.25; overflow:auto; max-height:320px; border-top:1px solid #f1f3f5; }
.patch-code::-webkit-scrollbar { height:8px; width:8px; }
.patch-code::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:6px; }
.patch-code::-webkit-scrollbar-thumb:hover { background:#94a3b8; }
.patch-deleted-note { padding:10px 12px; font-size:.65rem; font-style:italic; color:#7f1d1d; background:#fff1f2; }
.patch-empty { padding:10px; font-size:.65rem; opacity:.6; }
/* Line highlighting */
:global(.patch-code .pl) { display:block; padding:0 6px; border-left:4px solid transparent; }
:global(.patch-code .pl.add) { background:#ecfdf5; color:#065f46; border-left-color:#10b981; }
:global(.patch-code .pl.del) { background:#fef2f2; color:#991b1b; border-left-color:#dc2626; }
:global(.patch-code .pl.hunk) { background:#eff6ff; color:#1e3a8a; border-left-color:#3b82f6; font-weight:600; }
:global(.patch-code .pl.ctx) { color:#374151; }
@media (prefers-color-scheme: dark) {
  .patch-file { background: var(--color-surface); border-color: var(--color-border); }
  .patch-head { background: var(--color-accent); border-bottom-color: rgba(0,0,0,0.25); }
  .patch-path { color:#fff; }
  .patch-code { background:#0f172a; border-top-color:#1e293b; }
  :global(.patch-code .pl.ctx) { color:#cbd5e1; }
  :global(.patch-code .pl.add) { background:rgba(16,185,129,0.15); color:#6ee7b7; border-left-color:#10b981; }
  :global(.patch-code .pl.del) { background:rgba(220,38,38,0.15); color:#fca5a5; border-left-color:#dc2626; }
  :global(.patch-code .pl.hunk) { background:rgba(59,130,246,0.18); color:#93c5fd; border-left-color:#3b82f6; }
  .patch-deleted-note { background:#7f1d1d; color:#fecaca; }
}
</style>
