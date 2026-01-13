<script>
  import { requests, functionCalls, selection, filters, loadDataFromText, filteredIndices, filterIndex, navigateFullPrev, navigateFullNext, navigateFilteredPrev, navigateFilteredNext } from './lib/stores.js';
  import { onMount } from 'svelte';
  import DragDropArea from './components/DragDropArea.svelte';
  import TollCallsOverview from './components/TollCallsOverview.svelte';
  import RequestDetail from './components/RequestDetail.svelte';
  import SearchBar from './components/SearchBar.svelte';

  $: total = $functionCalls.length;
  $: currentPosition = $selection.callIndex + 1;
  $: fullIdx = $selection.callIndex || 0;
  $: totalAll = $selection.totalAll || 0;
  $: fList = $filteredIndices || [];
  $: fPos = $filterIndex || -1;
  $: filteredActive = fList.length > 0 && fPos !== -1;
  
  // Back to top button functionality
  let showBackToTop = false;
  
  onMount(() => {
    const handleScroll = () => {
      // Show back to top button when scrolled down more than 300px
      showBackToTop = window.scrollY > 300;
    };
    
    // Add scroll event listener
    window.addEventListener('scroll', handleScroll);
    
    // Clean up event listener when component is destroyed
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });
  
  // Function to scroll back to top with smooth animation
  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  function handleTextLoad(text) {
    loadDataFromText(text);
    // Re-run layout after data load (heights may change)
    setTimeout(layoutNav, 30);
  }

  // Dynamic vertical centering for left navigator (navigator exactly centered; global status above it)
  let navGroupEl; // navigator buttons container
  let globalStatusEl; // global status container
  let navReady = false;

  function layoutNav() {
    if (!navGroupEl) return;
    const vh = window.innerHeight;
    const navHeight = navGroupEl.offsetHeight || 0;
    // Center navigator: top such that its center aligns with viewport center
    let topNav = (vh - navHeight) / 2;
    // Keep some min padding from very top
    if (topNav < 20) topNav = 20;
    navGroupEl.style.top = `${Math.round(topNav)}px`;

    if (globalStatusEl) {
      const gsHeight = globalStatusEl.offsetHeight || 0;
      // Position global status above navigator with 16px gap
      let topStatus = topNav - gsHeight - 16;
      if (topStatus < 20) topStatus = 20; // don't go off-screen
      globalStatusEl.style.top = `${Math.round(topStatus)}px`;
    }
    navReady = true;
  }

  let resizeRaf;
  function handleResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layoutNav);
  }

  onMount(() => {
    layoutNav();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });
</script>

<div class="app-shell">
  <!-- Independent fixed global status (positioned above centered navigator) -->
  <div bind:this={globalStatusEl} class="global-status nav-left-status" aria-label="Global navigation status (All)">
    <div class="status-item">
      <span class="label">All</span>
      <span class="count-mini">{totalAll === 0 ? '0 / 0' : `${fullIdx + 1} / ${totalAll}`}</span>
    </div>
  </div>

  <!-- Centered navigator (buttons) -->
  <div bind:this={navGroupEl} class="nav-side nav-left-all nav-left-nav" style="opacity:{navReady ? 1 : 0};">
    <div class="nav-buttons-row">
      <button class="nav-side-btn nav-all-btn" 
              on:click={() => navigateFullPrev()}
              disabled={fullIdx <= 0}
              title="Previous (All)">
        ◀
      </button>
      <button class="nav-side-btn nav-all-btn" 
              on:click={() => navigateFullNext()}
              disabled={fullIdx >= totalAll - 1}
              title="Next (All)">
        ▶
      </button>
    </div>
  </div>

  <!-- Filtered tool calls navigation (right side) -->
  {#if fList.length > 0}
    <div class="nav-side nav-right-filtered">
      <div class="global-status nav-side-status" aria-label="Filtered navigation status">
        <div class="status-item">
          <span class="label">Filtered</span>
          <span class="count-mini">{filteredActive ? (fPos + 1) : 0} / {fList.length}</span>
        </div>
      </div>
      <div class="nav-buttons-row">
        <button class="nav-side-btn nav-filtered-btn" 
                on:click={() => navigateFilteredPrev()}
                disabled={fPos <= 0}
                title="Previous (Filtered)">
          ◀
        </button>
        <button class="nav-side-btn nav-filtered-btn" 
                on:click={() => navigateFilteredNext()}
                disabled={fPos >= fList.length - 1}
                title="Next (Filtered)">
          ▶
        </button>
      </div>
    </div>
  {/if}

  <!-- Header removed; controls redistributed to columns -->

  <!-- Two-column workspace -->
  <!-- Global status moved into left navigator (overview pane) -->

  <div class="workspace-split">
    <aside class="overview-pane" aria-label="Tool calls overview & controls">
      <div class="left-stack">
          <!-- Ingest + Filters grid: drag/drop 1/3, filters 2/3 stacked -->
          <div class="ingest-filters-grid" aria-label="Data load and filters">
            <div class="ingest-block">
              <DragDropArea on:loadText={(e)=>handleTextLoad(e.detail)} />
            </div>
            <div class="filters-stack" aria-label="Filtering controls">
              <SearchBar type="function" bind:value={$filters.fn} placeholder="Function search" />
              <SearchBar type="response" bind:value={$filters.response} placeholder="Response search" />
            </div>
          </div>
        {#if $requests.length > 0}
          <div class="toolcalls-scroll">
            <TollCallsOverview variant="panel" />
          </div>
        {:else}
          <div class="overview-empty-placeholder">
            <p class="placeholder-hint">Load a file to see tool calls grouped into rounds.</p>
          </div>
        {/if}
      </div>
    </aside>
    <main class="main-content" aria-label="Request detail panel">
      {#if $requests.length === 0}
        <div class="empty-state tall">
          <h2>No data loaded</h2>
          <p>Drag & drop a log file to begin.</p>
          <p class="file-hint">Supported: <code>sim‑requests-*.txt</code>, <code>*‑fetchlog‑*.txt</code>, or any valid JSON log file</p>
        </div>
      {:else}
        <RequestDetail />
      {/if}
    </main>
  </div>

  <aside class="sidebar compact">
    <!-- navigation + drag & drop + filters moved to header -->
  </aside>

  <!-- (Old single-column main removed in favor of workspace-split) -->

  <footer class="footer">Total calls: {total}. Current: {currentPosition}.</footer>
  
  <!-- Back to top button -->
  {#if showBackToTop}
    <button 
      class="back-to-top" 
      on:click={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
    </button>
  {/if}
</div>
