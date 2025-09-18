<script>
  import { filteredIndices, selection, filterIndex, navigateFullPrev, navigateFullNext, navigateFilteredPrev, navigateFilteredNext } from '../lib/stores.js';
  $: fullIdx = $selection.callIndex;
  $: totalAll = $selection.totalAll;
  $: fList = $filteredIndices;
  $: fPos = $filterIndex; // -1 if current selection not in filtered list
  $: filteredActive = fList.length > 0 && fPos !== -1;
</script>

<div class="nav-group">
  <div class="nav heading">Full List Navigation</div>
  <div class="nav controls">
    <button on:click={navigateFullPrev} disabled={fullIdx <= 0}>◀ Prev (All)</button>
    <div class="status">{fullIdx + 1} / {totalAll}</div>
    <button on:click={navigateFullNext} disabled={fullIdx >= totalAll - 1}>Next ▶ (All)</button>
  </div>

  <div class="nav heading" style="margin-top:10px; display:flex; align-items:center; gap:8px;">
    <span>Filtered Navigation</span>
    {#if fList.length === 0}
      <span class="small muted">(no active filter)</span>
    {:else if fPos === -1}
      <span class="small muted">(current item not in filtered set)</span>
    {/if}
  </div>
  <div class="nav controls">
    <button on:click={navigateFilteredPrev} disabled={!filteredActive || fPos <= 0}>◀ Prev (Filtered)</button>
    <div class="status">{filteredActive ? (fPos + 1) : 0} / {fList.length}</div>
    <button on:click={navigateFilteredNext} disabled={!filteredActive || fPos >= fList.length - 1}>Next ▶ (Filtered)</button>
  </div>
</div>

<style>
.nav-group { display:flex; flex-direction:column; gap:4px; margin:12px 0; }
.nav.controls { display:flex; gap:12px; align-items:center; }
.nav button { background:#3498db; border:none; color:#fff; padding:8px 14px; border-radius:6px; font-size:14px; cursor:pointer; }
.nav button:disabled { background:#bdc3c7; cursor:not-allowed; }
.status { font-weight:bold; min-width:80px; text-align:center; }
.heading { font-weight:600; font-size:14px; }
.small { font-size:12px; }
.muted { color:#666; }
</style>
