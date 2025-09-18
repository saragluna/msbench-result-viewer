<script>
  import { formatReplaceDiff, parseJSONSafe } from '../lib/utils.js';
  export let call;

  let view = 'auto'; // 'auto' | 'diff' | 'raw' | 'formatted'

  $: parsedArgs = typeof call.arguments === 'string' ? parseJSONSafe(call.arguments) : call.arguments;
  $: isReplace = call.name === 'replace_string_in_file';
  $: isCreateFile = call.name === 'create_file';

  function toggleDiff(){ view = view === 'diff' ? 'raw' : 'diff'; }
  function toggleFormatted(){ view = view === 'formatted' ? 'raw' : 'formatted'; }
</script>

<div class="fn-args">
  {#if isReplace}
    <div class="actions"><button on:click={toggleDiff}>{view === 'diff' ? 'Raw JSON' : 'View Diff'}</button></div>
    {#if view === 'diff' && parsedArgs?.oldString}
      <div class="diff-wrapper" aria-label="Replace diff view">{@html formatReplaceDiff(parsedArgs)}</div>
    {:else}
      <pre>{call.arguments}</pre>
    {/if}
  {:else if isCreateFile}
    <div class="actions"><button on:click={toggleFormatted}>{view === 'formatted' ? 'Raw JSON' : 'Formatted'}</button></div>
    {#if view === 'formatted' && parsedArgs?.content !== undefined}
      <div class="file-view">
        <div class="file-head"><span class="path">{parsedArgs.filePath}</span></div>
        <pre>{parsedArgs.content}</pre>
      </div>
    {:else}
      <pre>{call.arguments}</pre>
    {/if}
  {:else}
    <pre>{call.arguments}</pre>
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
</style>
