<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  const dispatch = createEventDispatcher();
  let dragOver = false;
  let globalDrag = false; // window-level drag state
  // Reference for the hidden file input (needed for click trigger)
  let fileInput;
  let cleanup = [];

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file);
  }
  function onDrop(e) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }
  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      dispatch('loadText', reader.result);
    };
    reader.readAsText(file);
  }
  function handleWindowDragOver(e){
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      globalDrag = true;
    }
  }
  function handleWindowDragLeave(e){
    if (e.relatedTarget == null) { globalDrag = false; dragOver = false; }
  }
  function handleWindowDrop(e){
    if (e.dataTransfer?.files?.length){
      e.preventDefault();
      readFile(e.dataTransfer.files[0]);
    }
    globalDrag = false; dragOver = false;
  }
  onMount(()=>{
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);
    cleanup = [
      () => window.removeEventListener('dragover', handleWindowDragOver),
      () => window.removeEventListener('dragleave', handleWindowDragLeave),
      () => window.removeEventListener('drop', handleWindowDrop)
    ];
  });
  onDestroy(()=> cleanup.forEach(fn=>fn()));
</script>

<div class="drag-drop compact {dragOver || globalDrag ? 'over' : ''}"
  role="button"
  tabindex="0"
     on:dragover|preventDefault={() => dragOver = true}
     on:dragleave|preventDefault={() => dragOver = false}
     on:drop={onDrop}
  on:click={() => fileInput.click()}
  on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.click()}>
  <div class="icon" aria-hidden="true">📁</div>
  <div class="dd-text-main">{(dragOver || globalDrag) ? 'Release to Load' : 'Drop / Click'}</div>
  <div class="dd-text-hint">Supports: sim-requests, fetchlog, or JSON files</div>
  <input bind:this={fileInput} type="file" accept=".txt,.json" style="display:none" on:change={onFile}>
  {#if globalDrag && !dragOver}
    <div class="global-overlay">Drop file anywhere to load</div>
  {/if}
</div>

<style>
.drag-drop { border:2px dashed #cbd5e1; padding:18px 14px 16px; border-radius:10px; text-align:center; cursor:pointer; transition: .25s; background:#f8fafc; position:relative; }
.drag-drop.compact { padding:14px 12px 12px; }
.drag-drop.over { border-color:#22c55e; background:#ecfdf5; }
.global-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:.75rem; font-weight:600; letter-spacing:.4px; color:#15803d; background:rgba(34,197,94,0.08); border-radius:inherit; pointer-events:none; animation:fadeIn .25s ease; }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
.icon { font-size:30px; margin:0 0 6px; color:#475569; line-height:1; }
.drag-drop.over .icon { color:#16a34a; }
.dd-text-main { font-size:.92rem; font-weight:700; letter-spacing:.2px; color:#334155; text-transform:none; }
.dd-text-hint { font-size:.72rem; margin-top:4px; color:#64748b; font-weight:400; }
@media (prefers-color-scheme: dark) {
  .drag-drop { background:#1f2730; border-color:#334150; }
  .drag-drop.over { background:#112318; }
  .icon { color:#9fb0c3; }
  .dd-text-main { color:#e2e8f0; }
  .dd-text-hint { color:#94a3b8; }
  .global-overlay { background:rgba(34,197,94,0.15); color:#4ade80; }
}
</style>
