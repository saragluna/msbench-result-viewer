<script>
  import { formatReplaceDiff, parseJSONSafe } from '../lib/utils.js';
  export let call;

  // view modes:
  //  diff       - show visual diff for replace_string_in_file
  //  formatted  - show pretty file content for create_file
  //  raw        - show raw JSON args
  //  auto       - (not currently differentiated but kept for possible future heuristics)
  // Default view mode; will auto-upgrade to diff/formatted for specific tool types
  let view = 'auto';

  $: parsedArgs = typeof call?.arguments === 'string' ? parseJSONSafe(call.arguments) : call?.arguments;
  $: isReplace = call?.name === 'replace_string_in_file';
  $: isCreateFile = call?.name === 'create_file';
  $: isApplyPatch = call?.name === 'apply_patch';

  // Extract raw patch text for apply_patch
  $: patchText = (() => {
    if (!isApplyPatch) return '';
    if (parsedArgs && typeof parsedArgs === 'object') {
      // Common parameter names: patch, input, diff
      return parsedArgs.patch || parsedArgs.input || parsedArgs.diff || '';
    }
    if (typeof call?.arguments === 'string') {
      const p = parseJSONSafe(call.arguments);
      if (p && typeof p === 'object') return p.patch || p.input || p.diff || '';
      // If arguments is already the patch block string
      if (/\*\*\* Begin Patch/.test(call.arguments)) return call.arguments;
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
      if (typeof call?.arguments === 'string') {
        const attempt = parseJSONSafe(call.arguments);
        if (attempt && typeof attempt === 'object') return JSON.stringify(attempt, null, 2);
        return call.arguments; // plain string
      }
      if (call?.arguments !== undefined) return JSON.stringify(call.arguments, null, 2);
      return '';
    } catch { return typeof call?.arguments === 'string' ? call.arguments : ''; }
  })();

  // Auto-select a richer default visualization the first time we see these tools
  $: if (view === 'auto') {
    if (isReplace && parsedArgs?.oldString) {
      view = 'diff';
    } else if (isCreateFile && parsedArgs?.content !== undefined) {
      view = 'formatted';
    } else if (isApplyPatch && patchBlocks.length) {
      view = 'patch';
    }
  }

  function toggleDiff () { view = view === 'diff' ? 'raw' : 'diff'; }
  function toggleFormatted () { view = view === 'formatted' ? 'raw' : 'formatted'; }
  function togglePatch () { view = view === 'patch' ? 'raw' : 'patch'; }
</script>

<div class="fn-args">
  {#if isReplace}
    <div class="actions"><button on:click={toggleDiff}>{view === 'diff' ? 'Raw JSON' : 'View Diff'}</button></div>
    {#if view === 'diff' && parsedArgs?.oldString}
      <div class="diff-wrapper" aria-label="Replace diff view">{@html formatReplaceDiff(parsedArgs)}</div>
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
              <span class="patch-action tag-{blk.action.toLowerCase()}">{blk.action}</span>
              <span class="patch-path" title={blk.filePath}>{blk.filePath}</span>
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
    <pre>{formattedArgs}</pre>
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
:global(.diff-header) { background:#e9ecef; padding:6px 10px; border-bottom:1px solid #dee2e6; font-weight:600; font-size:.8rem; }
:global(.diff-section h4) { margin:0; padding:6px 10px; font-size:.8rem; }
:global(.diff-old) { background:#f8d7da; border-left:4px solid #dc3545; }
:global(.diff-old h4) { color:#721c24; background:#f5c6cb; }
:global(.diff-new) { background:#d4edda; border-left:4px solid #28a745; }
:global(.diff-new h4) { color:#155724; background:#c3e6cb; }
:global(.diff-content) { padding:10px; font-family:monospace; font-size:.75rem; line-height:1.4; white-space:pre-wrap; overflow:auto; max-height:250px; }

/* Apply Patch visualization */
.patch-view { display:flex; flex-direction:column; gap:10px; }
.patch-file { border:1px solid #dee2e6; border-radius:6px; background:#f8f9fa; box-shadow:0 1px 2px rgba(0,0,0,0.05); overflow:hidden; }
.patch-head { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#e9ecef; border-bottom:1px solid #dee2e6; font-weight:600; font-size:.72rem; font-family:monospace; }
.patch-action { text-transform:uppercase; font-size:.55rem; letter-spacing:.6px; padding:3px 6px; border-radius:10px; font-weight:700; }
.patch-action.tag-update { background:#dbeafe; color:#1e3a8a; }
.patch-action.tag-add { background:#dcfce7; color:#166534; }
.patch-action.tag-delete { background:#fee2e2; color:#991b1b; }
.patch-path { font-family:monospace; font-size:.6rem; background:#343a40; color:#f8f9fa; padding:3px 6px; border-radius:4px; max-width:60%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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
  .patch-file { background:#1e293b; border-color:#334155; }
  .patch-head { background:#0f172a; border-bottom-color:#334155; }
  .patch-path { background:#475569; color:#f1f5f9; }
  .patch-code { background:#0f172a; border-top-color:#1e293b; }
  :global(.patch-code .pl.ctx) { color:#cbd5e1; }
  :global(.patch-code .pl.add) { background:rgba(16,185,129,0.15); color:#6ee7b7; border-left-color:#10b981; }
  :global(.patch-code .pl.del) { background:rgba(220,38,38,0.15); color:#fca5a5; border-left-color:#dc2626; }
  :global(.patch-code .pl.hunk) { background:rgba(59,130,246,0.18); color:#93c5fd; border-left-color:#3b82f6; }
  .patch-deleted-note { background:#7f1d1d; color:#fecaca; }
}
</style>
