<script>
  import { functionCalls, selection, filteredIndices, activeList, groupedCalls, shouldHideRequestFrame, selectCall, requests } from '../lib/stores.js';
  import { onMount, tick } from 'svelte';
  export let variant = 'panel'; // 'panel' | 'top'

  // (Removed collapse toggle per request)
  
  $: list = $activeList; // indices to show
  $: groups = $groupedCalls; // grouped by request
  $: hideFrame = $shouldHideRequestFrame; // hide request frame when tool calls = requests
  $: fullRequests = $requests; // complete list for round detection independent of filters

  // --- Span-based round logic ---
  // 1. Each request has a response.requestId (may repeat across many consecutive or separated indices).
  // 2. Compute the span (firstIndex, lastIndex) for every distinct requestId.
  // 3. A span is considered a TOP-LEVEL (parent) span if it is NOT fully contained within another span.
  //    Containment: spanA is contained in spanB when firstB <= firstA and lastA <= lastB and at least one inequality is strict.
  // 4. Round numbers are assigned in chronological order to top-level spans (by firstIndex).
  // 5. For any request index, its round is the round of the (outermost) top-level span that contains it.
  // 6. A round boundary/separator is shown at the first index of each top-level span.
  // 7. Requests missing a requestId get a synthetic id to avoid collisions.

  // Build spans from fullRequests
  $: requestIdSpans = (() => {
    const spans = new Map(); // id -> { first, last }
    fullRequests.forEach((req, idx) => {
      const rid = req?.response?.requestId || `__noid_${idx}`;
      if (!spans.has(rid)) spans.set(rid, { first: idx, last: idx, id: rid });
      else spans.get(rid).last = idx;
    });
    return Array.from(spans.values()).sort((a, b) => a.first - b.first || a.last - b.last);
  })();

  // Determine which spans are top-level (not contained by any other)
  $: topLevelSpans = (() => {
    const tops = [];
    for (let i = 0; i < requestIdSpans.length; i++) {
      const a = requestIdSpans[i];
      let contained = false;
      for (let j = 0; j < requestIdSpans.length; j++) {
        if (i === j) continue;
        const b = requestIdSpans[j];
        // b contains a?
        if (b.first <= a.first && a.last <= b.last && (b.first < a.first || a.last < b.last)) {
          contained = true; break;
        }
      }
      if (!contained) tops.push({ ...a });
    }
    // sort by start to enforce chronological ordering
    tops.sort((a, b) => a.first - b.first);
    // assign round numbers
    tops.forEach((t, i) => { t.round = i + 1; });
    return tops;
  })();

  // Lookup array: for each request index, store round & start flag
  $: roundByRequestIndex = (() => {
    const arr = new Array(fullRequests.length).fill(null);
    for (const span of topLevelSpans) {
      for (let i = span.first; i <= span.last; i++) {
        arr[i] = { round: span.round, isRoundStart: i === span.first, topSpanId: span.id };
      }
    }
    return arr;
  })();

  // Map each grouped request to round & metadata (formerly removed during refactor)
  $: requestRoundMap = groups.map(g => {
    const rid = g.request?.response?.requestId || `__noid_${g.requestIndex}`;
    // find round info by request index
    const spanInfo = roundByRequestIndex[g.requestIndex] || { round: 0, isRoundStart: false, topSpanId: rid };
    return {
      requestIndex: g.requestIndex,
      request: g.request,
      requestId: rid,
      calls: g.calls,
      isRoundStart: spanInfo.isRoundStart,
      roundNumber: spanInfo.round,
      topSpanId: spanInfo.topSpanId
    };
  });
  // Helper to truncate long request ids for inline display
  function truncateId(id, max = 18) {
    if (!id) return '';
    if (id.length <= max) return id;
    const tail = 5;
    return id.slice(0, max - (tail + 1)) + '…' + id.slice(-tail);
  }
  let scrollEl; // bound via bind:this
  let lastScrolledIndex = -1;
  async function scrollSelectedIntoView(center = true) {
    if (!scrollEl) return;
    const idx = $selection?.callIndex;
    if (idx == null || idx < 0) return;
    await tick();
    const btn = scrollEl.querySelector(`button[data-call-index='${idx}']`);
    if (!btn) return;
    const elTop = btn.offsetTop;
    const elBottom = elTop + btn.offsetHeight;
    const viewTop = scrollEl.scrollTop;
    const viewBottom = viewTop + scrollEl.clientHeight;
    if (elTop >= viewTop && elBottom <= viewBottom) return; // fully visible
    if (center) {
      const target = elTop - (scrollEl.clientHeight / 2) + (btn.offsetHeight / 2);
      scrollEl.scrollTo({ top: Math.max(target, 0), behavior: 'smooth' });
    } else {
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }
  $: if ($selection.callIndex !== lastScrolledIndex) {
    lastScrolledIndex = $selection.callIndex;
    scrollSelectedIntoView();
  }
</script>

<section class="calls-panel {variant === 'top' ? 'top-mode' : 'dense'} {hideFrame ? 'flat-mode' : 'grouped-mode'}" data-variant={variant}>
  <header class="section-header calls-header">
    <div class="header-title">
  <h2>Next tool calls</h2>
    </div>
    <div class="section-meta">
      <span class="count-badge">{list.length}</span>
    </div>
  </header>
    
  <div class="calls-scroll" bind:this={scrollEl} role="region" aria-label="Tool calls scroll area">
  <div id="tool-calls-content" class="calls-content">
    {#if !groups.length}
      <div class="empty">No matches.</div>
    {:else}
  {#if hideFrame}
    <!-- When hiding frame, show all calls directly in a simple container -->
    <div class="flat-calls-container {variant === 'top' ? 'top-flow' : 'panel-flow'}" role="listbox" aria-label="Tool calls">
      {#each requestRoundMap as rm}
        {#if rm.isRoundStart}
          <div class="round-full-separator" data-round={rm.roundNumber} data-request-id={rm.requestId} title={`Round ${rm.roundNumber} • ${rm.requestId}`} aria-label={`Round ${rm.roundNumber} boundary (request id ${rm.requestId})`}>
            <span class="rfs-line" aria-hidden="true"></span>
            <span class="rfs-label">Round {rm.roundNumber}<span class="rfs-id" title={rm.requestId}>{truncateId(rm.requestId)}</span></span>
            <span class="rfs-line" aria-hidden="true"></span>
          </div>
        {/if}
        {#each rm.calls as call}
          <button
            role="option"
            aria-selected={$selection.callIndex === call.originalIndex}
            class:selected={$selection.callIndex === call.originalIndex}
            class:topchip={variant === 'top'}
            style="--chip-color:{call.color}"
            data-call-index={call.originalIndex}
            aria-label={'Tool call ' + (call.name || 'None') + (call.request?.response?.type === 'failed' ? ' (failed response)' : '')}
            on:click={() => selectCall(call.originalIndex)}>
            <span class="num">{call.originalIndex + 1}</span>
            <span class="name">{call.name}</span>
            {#if call.conversationSummary}<span class="summary-emoji" title="Conversation summary" aria-hidden="true">📋</span>{/if}
            {#if call.request?.response?.type === 'failed'}<span class="fail-emoji" title="Failed response" aria-hidden="true">⚠️</span>{/if}
          </button>
        {/each}
      {/each}
    </div>
  {:else}
    <!-- Normal mode with request group frames -->
    <div class="mixed-calls {variant === 'top' ? 'top-flow' : 'panel-flow'}" role="listbox" aria-label="Tool calls (multi-call requests framed, single-call inline)">
      {#each groups as group, gi}
        {#key 'grp-'+group.requestIndex}
          {#if requestRoundMap[gi].isRoundStart}
            <div class="round-full-separator" data-round={requestRoundMap[gi].roundNumber} data-request-id={requestRoundMap[gi].requestId} title={`Round ${requestRoundMap[gi].roundNumber} • ${requestRoundMap[gi].requestId}`} aria-label={`Round ${requestRoundMap[gi].roundNumber} boundary (request id ${requestRoundMap[gi].requestId})`}>
              <span class="rfs-line" aria-hidden="true"></span>
              <span class="rfs-label">Round {requestRoundMap[gi].roundNumber}<span class="rfs-id" title={requestRoundMap[gi].requestId}>{truncateId(requestRoundMap[gi].requestId)}</span></span>
              <span class="rfs-line" aria-hidden="true"></span>
            </div>
          {/if}
          {#if group.calls.length > 1}
            <div class="request-group" data-request-index={group.requestIndex} data-request-id={requestRoundMap[gi].requestId} data-round={requestRoundMap[gi].roundNumber}>
              <div class="group-calls-container" aria-label={`Request ${group.requestIndex + 1} with ${group.calls.length} calls`}>
                {#each group.calls as call}
                  <button
                    role="option"
                    aria-selected={$selection.callIndex === call.originalIndex}
                    class:selected={$selection.callIndex === call.originalIndex}
                    class:topchip={variant === 'top'}
                    style="--chip-color:{call.color}"
                    data-round={requestRoundMap[gi].roundNumber}
                    data-req-info={`Request ${group.requestIndex + 1} • ${group.calls.length} calls`}
                    data-call-index={call.originalIndex}
          aria-label={'Tool call ' + (call.name || 'None') + (call.request?.response?.type === 'failed' ? ' (failed response)' : '')}
                    on:click={() => selectCall(call.originalIndex)}>
                    <span class="num">{call.originalIndex + 1}</span>
                    <span class="name">{call.name}</span>
                    {#if call.conversationSummary}<span class="summary-emoji" title="Conversation summary" aria-hidden="true">📋</span>{/if}
          {#if call.request?.response?.type === 'failed'}<span class="fail-emoji" title="Failed response" aria-hidden="true">⚠️</span>{/if}
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            {#each group.calls as call}
              <button
                role="option"
                aria-selected={$selection.callIndex === call.originalIndex}
                class:selected={$selection.callIndex === call.originalIndex}
                class:topchip={variant === 'top'}
                style="--chip-color:{call.color}"
                data-round={requestRoundMap[gi].roundNumber}
                data-call-index={call.originalIndex}
                data-req-info={`Request ${group.requestIndex + 1} • 1 call`}
        aria-label={'Tool call ' + (call.name || 'None') + ' (single-call request)' + (call.request?.response?.type === 'failed' ? ' (failed response)' : '')}
                on:click={() => selectCall(call.originalIndex)}>
                <span class="num">{call.originalIndex + 1}</span>
                <span class="name">{call.name}</span>
                {#if call.conversationSummary}<span class="summary-emoji" title="Conversation summary" aria-hidden="true">📋</span>{/if}
        {#if call.request?.response?.type === 'failed'}<span class="fail-emoji" title="Failed response" aria-hidden="true">⚠️</span>{/if}
              </button>
            {/each}
          {/if}
        {/key}
      {/each}
    </div>
    {/if}
    {/if}
  </div>
  </div>
</section>

<style>
.calls-panel {
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--color-surface), rgba(255,255,255,0.3));
  overflow: hidden; /* clip inner scroll so radius shows */
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  height: 100%;
}
.calls-panel:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}
.calls-panel.top-mode { 
  background: rgba(255, 255, 255, 0.6); 
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0;
  margin: 0; 
  max-height: none; 
  overflow: visible;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.04);
}

/* Section header styling matching RequestDetail */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(90deg, var(--color-accent-soft), rgba(255,255,255,0.6));
  border-bottom: 1px solid var(--color-border);
  position: relative;
}

.section-header::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--color-accent), transparent);
  opacity: 0.5;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-accent);
  letter-spacing: 0.3px;
  text-transform: uppercase;
  position: relative;
  padding-left: 14px;
}

.section-header h2::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 16px;
  background: var(--color-accent);
  border-radius: 3px;
}

.section-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.calls-panel .calls-header {
  background: linear-gradient(90deg, #f1f5f9, #fafafa);
  border-bottom: 1px solid #e5e7eb;
  position: relative;
}

.calls-panel .calls-header::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  height: 3px;
  width: 100%;
  background: linear-gradient(90deg, #3b82f6, #10b981);
}

.calls-panel .section-header.calls-header h2 {
  color: #4b5563 !important;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding-left: 14px;
  position: relative;
}

.calls-panel .section-header.calls-header h2::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 16px;
  background: #3b82f6;
  background: linear-gradient(180deg, #3b82f6, #10b981);
  border-radius: 3px;
}

.calls-content {
  padding: 12px 16px 16px;
  background: rgba(255, 255, 255, 0.7);
  max-height: none;
  overflow: visible;
  transition: padding 0.2s ease, opacity 0.2s ease;
  opacity: 1;
  scrollbar-width: thin;
}
/* Header now static; scrolling handled inside .calls-scroll */
.calls-panel .section-header.calls-header { 
  position:relative; 
  z-index:5; 
  background: var(--color-surface, #fff);
  box-shadow: 0 1px 0 rgba(0,0,0,0.05);
}

/* (Removed collapse toggle styles and collapsed state styles) */

/* Legacy top-mode styling for backward compatibility */
.calls-panel.top-mode .calls-content { 
  padding: 10px 12px;
  border-top: none;
}

/* Adjust header margin based on mode (static) */

/* Request group layout - grid with horizontal scroll */
/* (Removed .request-groups styles after unifying into .mixed-calls) */

/* Compact frame for multi-call groups */
.request-group { 
  border: 1px solid #e2e8f0; 
  padding: 4px 6px 5px; 
  background: #f8fafc; 
  border-radius: 6px; 
  transition: all 0.2s ease; 
  overflow: visible; 
  box-shadow: 0 2px 3px rgba(0,0,0,0.05);
  display: inline-flex;
  flex-direction: row;
  align-items: stretch;
  gap: 2px;
}

.request-group:hover { 
  border-color: #3b82f6; 
  background: #eff6ff; 
  box-shadow: 0 4px 8px rgba(59,130,246,0.12), 0 2px 4px rgba(59,130,246,0.08); 
  transform: translateY(-2px);
}

/* Group calls now fully visible (no internal scroll) */
.group-calls-container {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
  overflow: visible;
  max-height: none;
  padding: 0;
  margin: 0;
}

/* Inline single-call aggregation row */
/* Unified mixed layout: single-call buttons inline with multi-call framed groups */
.mixed-calls { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start; }
.mixed-calls.top-flow { display:flex; flex-wrap:wrap; gap:6px; }
.mixed-calls > .request-group, .mixed-calls > button { vertical-align: top; }
.request-group .group-calls-container button { margin:1px; }
.request-group .group-calls-container button:first-child { margin-left:1px; }

/* Legacy single-line styles removed (replaced by mixed-calls) */

/* Removed inner scrollbar styling (no longer scrolls) */

/* Flat calls container for when request frame is hidden */
.flat-calls-container { 
  display:flex; 
  flex-wrap:wrap; 
  gap:6px; 
  padding:2px 0;
}
.flat-calls-container.top-flow { 
  display:flex; 
  flex-wrap:wrap; 
  gap:8px; 
  padding:4px 0;
}
.flat-calls-container.panel-flow { 
  display:flex; 
  flex-wrap:wrap; 
  gap:6px; 
  padding:2px 0;
}

/* Enhanced chip styles */
button { 
  --_c: var(--chip-color,#666); 
  background: var(--_c); 
  border: none; 
  color: #fff; 
  padding: 2px 7px; 
  border-radius: 5px; 
  cursor: pointer; 
  font-size: .62rem; 
  line-height: 1.15; 
  font-weight: 600; 
  letter-spacing: 0.25px; 
  position: relative; 
  display: inline-flex; 
  align-items: center; 
  gap: 4px; 
  min-height: 22px; 
  box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 1px 1px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,0.18); 
  transition: all 0.18s ease; 
  white-space: nowrap; 
  flex-shrink: 0;
  text-shadow: 0 1px 1px rgba(0,0,0,0.15);
  overflow: hidden;
  margin: 2px;
}

button:hover { 
  transform: translateY(-1px); 
  box-shadow: 0 4px 6px rgba(0,0,0,.15), 0 2px 3px rgba(0,0,0,.1), inset 0 1px 0 rgba(255,255,255,0.2); 
  filter: brightness(1.1);
}

button::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 60%);
  pointer-events: none;
}

button.topchip { 
  flex-direction: row; 
  align-items: center; 
  gap: 4px; 
  min-height: 22px; 
  padding: 2px 8px; 
  font-size: .66rem; 
  line-height: 1.15; 
  background: var(--chip-color, #666); 
  color: #fff; 
  border: none; 
  box-shadow: 0 1px 3px rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.09), inset 0 1px 0 rgba(255,255,255,0.18); 
  font-weight: 600; 
  border-radius: 6px;
  position: relative;
}


button.topchip .name { 
  max-width: 100px; 
  color: #fff; 
  font-weight: 600;
}

/* Dot preceding each chip */

/* Numeric index */
.num {
  font-size: 10px;
  font-weight: 700;
  background: rgba(0,0,0,0.3);
  color: #fff;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  margin-right: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.3);
}

button.topchip:hover { 
  transform: translateY(-1px); 
  box-shadow: 0 4px 8px rgba(0,0,0,.2), 0 2px 4px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,0.2); 
  filter: brightness(1.1);
}


button .name { 
  display: block; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  white-space: nowrap; 
  font-size: .6rem; 
  color: #fff; 
  font-weight: 600; 
  max-width: 110px;
  letter-spacing: .25px;
}

/* Failed response emoji indicator */
.fail-emoji { font-size:.7rem; line-height:1; display:inline-flex; align-items:center; margin-left:2px; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.25)); }
.summary-emoji { font-size:.7rem; line-height:1; display:inline-flex; align-items:center; margin-left:2px; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.25)); }

button.topchip.selected { 
  outline: none; 
  position:relative;
  background: linear-gradient(135deg, var(--_c) 0%, color-mix(in srgb, var(--_c) 80%, #ffffff) 100%);
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--_c), 0 4px 10px rgba(0,0,0,0.35);
  filter: brightness(1.05) saturate(1.15);
  transform: translateY(-1px) scale(1.05);
}

/* Non-topchip variant selected (fallback) */
button.selected:not(.topchip) {
  outline:none;
  position:relative;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--_c), 0 6px 12px rgba(0,0,0,0.3);
  filter: brightness(1.08) saturate(1.2);
  transform: translateY(-1px) scale(1.04);
}

/* Animated subtle pulse to draw the eye without being distracting */
button.selected::after { 
  content:""; 
  position:absolute; 
  inset:-4px; 
  border-radius:8px; 
  background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), rgba(255,255,255,0) 70%); 
  opacity:.55; 
  pointer-events:none; 
  mix-blend-mode:overlay; 
  animation: selPulse 2.2s ease-in-out infinite; 
}

@keyframes selPulse { 
  0% { opacity:.55; transform:scale(1); }
  50% { opacity:.15; transform:scale(1.05); }
  100% { opacity:.55; transform:scale(1); }
}

/* Chip tooltip (request info) */
button[data-req-info] { position:relative; }
button[data-req-info]:hover::after, button[data-req-info]:focus-visible::after { 
  content: attr(data-req-info); 
  position:absolute; 
  left:50%; 
  top:-6px; 
  transform: translate(-50%, -100%); 
  background: #0f172a; 
  color:#fff; 
  padding:4px 8px; 
  font-size:.55rem; 
  white-space:nowrap; 
  border-radius:4px; 
  box-shadow:0 2px 6px rgba(0,0,0,0.25); 
  pointer-events:none; 
  z-index:20; 
  opacity:0; 
  animation: fadeInTooltip .18s ease forwards; 
}
button[data-req-info]:hover::before, button[data-req-info]:focus-visible::before { 
  content:""; 
  position:absolute; 
  left:50%; 
  top:-6px; 
  transform: translate(-50%, -100%); 
  width:0; height:0; 
  border:6px solid transparent; 
  border-top:none; 
  border-bottom:6px solid #0f172a; 
  z-index:21; 
  pointer-events:none; 
  opacity:0; 
  animation: fadeInTooltip .18s ease forwards; 
}
@media (prefers-color-scheme: dark) {
  button[data-req-info]:hover::after, button[data-req-info]:focus-visible::after { background:#1e293b; }
  button[data-req-info]:hover::before, button[data-req-info]:focus-visible::before { border-bottom-color:#1e293b; }
}
@keyframes fadeInTooltip { from { opacity:0; transform: translate(-50%, -90%); } to { opacity:1; transform: translate(-50%, -100%); } }

/* Round chip separator */
/* Full-width round separator */
.round-full-separator { display:flex; align-items:center; gap:8px; width:100%; margin:8px 0 4px; padding:2px 4px; box-sizing:border-box; }
.round-full-separator .rfs-line { flex:1; border-top:1px dotted #0ea5e9; opacity:.6; }
.round-full-separator .rfs-label { font-size:.55rem; font-weight:700; color:#0ea5e9; letter-spacing:.6px; text-transform:uppercase; background:#fff; padding:2px 8px; border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,0.08); line-height:1; }
.round-full-separator .rfs-label .rfs-id { 
  display:inline-block; 
  margin-left:6px; 
  font-size:.48rem; 
  font-weight:600; 
  letter-spacing:.4px; 
  background:rgba(14,165,233,0.08); 
  color:#0369a1; 
  padding:2px 6px; 
  border-radius:10px; 
  max-width:140px; 
  white-space:nowrap; 
  overflow:hidden; 
  text-overflow:ellipsis; 
  vertical-align:middle;
}
@media (prefers-color-scheme: dark) { 
  .round-full-separator .rfs-line { border-top-color:#38bdf8; opacity:.7; }
  .round-full-separator .rfs-label { background:#0f172a; color:#38bdf8; box-shadow:0 1px 2px rgba(0,0,0,0.6); }
  .round-full-separator .rfs-label .rfs-id { background:rgba(56,189,248,0.15); color:#38bdf8; }
}

button:focus-visible { 
  outline: 2px solid #fff; 
  outline-offset: 2px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.7), 0 0 0 4px rgba(59,130,246,0.3);
}
.empty { font-style:italic; color:#666; font-size:.65rem; padding:4px 2px; }
.count-badge {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: .6rem;
  font-weight: 600;
  letter-spacing: .5px;
}


@media (prefers-color-scheme: dark) {
  .calls-panel {
    background: linear-gradient(180deg, #1e293b, #0f172a);
    border-color: #334155;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  
  .calls-panel:hover {
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .calls-panel.top-mode { 
    background: rgba(15, 23, 42, 0.8);
    border-color: #334155;
  }
  
  .section-header {
    background: linear-gradient(90deg, rgba(56,189,248,0.15), rgba(15, 23, 42, 0.6));
    border-bottom-color: #334155;
  }
  
  .section-header::after {
    background: linear-gradient(90deg, #38bdf8, transparent);
  }
  
  .calls-panel .calls-header {
    background: linear-gradient(90deg, #1e293b, #0f172a);
    border-bottom-color: #334155;
  }
  
  .calls-panel .calls-header::after {
    background: linear-gradient(90deg, #38bdf8, #10b981);
    opacity: 0.8;
  }
  
  .calls-panel .section-header.calls-header h2 {
    color: #e2e8f0 !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
  
  .calls-panel .section-header.calls-header h2::before {
    background: linear-gradient(180deg, #38bdf8, #10b981);
  }
  
  .calls-content {
    background: rgba(30, 41, 59, 0.7);
  }
  
  .request-group {
    border-color: #334155;
    background: #1e293b;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
  
  .request-group:hover {
    border-color: #38bdf8;
    background: #0f172a;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.5), 0 2px 4px rgba(56, 189, 248, 0.2);
  }
  
  
  button { 
    box-shadow: 0 2px 4px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,0.1); 
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  
  button::after {
    background: linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 60%);
  }
  
  button.topchip { 
    background: #1e293b; 
    color: #e2e8f0; 
    box-shadow: 0 2px 4px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .num { background: rgba(255,255,255,0.07); color:#f1f5f9; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.6); }
  
  button.topchip:hover { 
    background: #0f172a;
    box-shadow: 0 4px 8px rgba(0,0,0,.4), 0 2px 4px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,0.07);
  }
  
  button.selected, button.topchip.selected {
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.7), 0 4px 8px rgba(0,0,0,.4);
    outline-color: rgba(56, 189, 248, 0.7);
  }
}

/* ================= Layout / Style Overrides (Enhancement) ================= */
/* These override earlier definitions to improve horizontal layout & sizing */
.calls-panel { width:100%; flex:1 1 auto; min-height:0; }
.section-header { padding:10px 14px; flex-wrap:nowrap; gap:16px; min-width:0; }
.header-title { min-width:0; flex:0 1 auto; overflow:hidden; }
.section-meta { gap:10px; white-space:nowrap; }
.section-header h2 { font-size:1rem; padding-left:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.calls-content { padding:12px 14px 14px; max-height:none; flex:1 1 auto; min-height:0; }

/* Scrollable list container */
.calls-scroll { 
  overflow-y:auto; 
  -webkit-overflow-scrolling: touch; 
  flex:1 1 auto; 
  height:100%;
}
.calls-scroll::-webkit-scrollbar { width:8px; }
.calls-scroll::-webkit-scrollbar-thumb { background: var(--color-border); border-radius:10px; }

/* Chip sizing tweaks */
/* Removed earlier size overrides after normalization */

/* Responsive adjustments */
@media (max-width: 900px) { .section-header { flex-wrap:wrap; } .section-meta { order:2; width:100%; justify-content:flex-start; } }
@media (max-width: 600px) { 
  .section-header { padding:8px 10px; }
  .calls-content { padding:8px 10px 10px; }
  button { font-size:.55rem; }
  button.topchip { font-size:.6rem; }
  .round-full-separator .rfs-label { font-size:.5rem; }
}
</style>
