<script>
  import ToolCallArgs from './ToolCallArgs.svelte';
  import { toolCallResults } from '../lib/stores.js';

  export let current;
  export let req;

  function scrollToAnchor(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Response metadata reactive derivation
  $: responseMeta = req?.response ? {
    type: req.response.type,
    reason: req.response.reason,
    requestId: req.response.requestId,
    serverRequestId: req.response.serverRequestId
  } : null;
  let showRawResponse = false;
  // Copy feedback state per metadata key
  let metaCopyState = {};
  let metaCopyTimer = {};

  function truncateMiddle(str, max = 24) {
    if (!str || typeof str !== 'string') return str || '';
    if (str.length <= max) return str;
    const half = Math.floor((max - 3) / 2);
    return str.slice(0, half) + '…' + str.slice(str.length - half);
  }

  async function copyMeta(key, value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      metaCopyState = { ...metaCopyState, [key]: true };
      clearTimeout(metaCopyTimer[key]);
      metaCopyTimer[key] = setTimeout(() => {
        metaCopyState = { ...metaCopyState, [key]: false };
      }, 1400);
    } catch (e) {
      console.warn('Failed to copy metadata', key, e);
    }
  }

  async function copyAllMeta() {
    if (!responseMeta) return;
    const text = JSON.stringify(responseMeta, null, 2);
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  // Result toggle state per tool call id (true/undefined = open, false = closed)
  let resultOpen = {};
  function toggleResultById(id) {
    const open = resultOpen[id] !== false; // treat undefined as open
    resultOpen = { ...resultOpen, [id]: !open };
  }
</script>

<!-- Response Detail Section -->
<section class="main-section response-section">
  <header class="section-header">
    <h2>Response Detail</h2>
    <div class="section-meta">
      <span class="section-info">AI Response, Tool Calls & Usage</span>
    </div>
  </header>

  {#if req?.response}
    {#if responseMeta}
      <section class="group response-meta-group">
        <details class="collapsible" data-role="response-meta" open aria-label="Response metadata group">
          <summary><span class="caret"></span><h3>Response Metadata</h3></summary>
          <div class="collapsible-body">
            <div class="response-meta-table" role="table" aria-label="Response metadata key value pairs">
              <div class="meta-row" role="row">
                <div class="meta-cell key" role="cell">Type</div>
                <div class="meta-cell val" role="cell">
                  {#if responseMeta.type}
                    <span class="meta-badge {responseMeta.type}">{responseMeta.type}</span>
                  {:else}<span class="meta-missing">—</span>{/if}
                </div>
                <div class="meta-cell action" role="cell">
                  {#if responseMeta.type}
                    <button class="copy-btn" title="Copy Type" on:click={() => copyMeta('type', responseMeta.type)}>{metaCopyState.type ? '✓' : '⧉'}</button>
                  {/if}
                </div>
              </div>
              <div class="meta-row" role="row">
                <div class="meta-cell key" role="cell">Reason</div>
                <div class="meta-cell val" role="cell">
                  {#if responseMeta.reason}
                    <span class="reason-badge reason-{responseMeta.reason}">{responseMeta.reason}</span>
                  {:else}<span class="meta-missing">—</span>{/if}
                </div>
                <div class="meta-cell action" role="cell">
                  {#if responseMeta.reason}
                    <button class="copy-btn" title="Copy Reason" on:click={() => copyMeta('reason', responseMeta.reason)}>{metaCopyState.reason ? '✓' : '⧉'}</button>
                  {/if}
                </div>
              </div>
              <div class="meta-row" role="row">
                <div class="meta-cell key" role="cell">Request ID</div>
                <div class="meta-cell val" role="cell">
                  {#if responseMeta.requestId}
                    <code class="id-frag full" title={responseMeta.requestId}>{responseMeta.requestId}</code>
                  {:else}<span class="meta-missing">—</span>{/if}
                </div>
                <div class="meta-cell action" role="cell">
                  {#if responseMeta.requestId}
                    <button class="copy-btn" title="Copy Request ID" on:click={() => copyMeta('requestId', responseMeta.requestId)}>{metaCopyState.requestId ? '✓' : '⧉'}</button>
                  {/if}
                </div>
              </div>
              <div class="meta-row" role="row">
                <div class="meta-cell key" role="cell">Server Request ID</div>
                <div class="meta-cell val" role="cell">
                  {#if responseMeta.serverRequestId}
                    <code class="id-frag full" title={responseMeta.serverRequestId}>{responseMeta.serverRequestId}</code>
                  {:else}<span class="meta-missing">—</span>{/if}
                </div>
                <div class="meta-cell action" role="cell">
                  {#if responseMeta.serverRequestId}
                    <button class="copy-btn" title="Copy Server Request ID" on:click={() => copyMeta('serverRequestId', responseMeta.serverRequestId)}>{metaCopyState.serverRequestId ? '✓' : '⧉'}</button>
                  {/if}
                </div>
              </div>
            </div>
            <div class="meta-actions-row">
              <button class="mini-btn" on:click={() => showRawResponse = !showRawResponse}>{showRawResponse ? 'Hide Raw Response JSON' : 'Show Raw Response JSON'}</button>
              <button class="mini-btn alt" on:click={copyAllMeta} title="Copy all metadata JSON">Copy All</button>
            </div>
            {#if showRawResponse}
              <pre class="code-block small" style="margin-top:6px;">{JSON.stringify(req.response, null, 2)}</pre>
            {/if}
          </div>
        </details>
      </section>
    {/if}
    <!-- Response Text -->
    {#if req.response.value?.length}
      <section class="group response-text-group">
        <details class="collapsible" open data-role="response-text" aria-label="Response text group">
          <summary><span class="caret"></span><h3>Response Text</h3></summary>
          <div class="collapsible-body">
            <pre class="code-block">{req.response.value.join('\n')}</pre>
          </div>
        </details>
      </section>
    {/if}

    <!-- Tool Calls (Response-side) -->
    {#if req.response.copilotFunctionCalls?.length}
      <section class="group response-calls-group">
        <details class="collapsible" open data-role="response-calls" aria-label="Response tool calls group">
          <summary><span class="caret"></span><h3>Tool Calls <span class="count-badge">{req.response.copilotFunctionCalls.length}</span></h3></summary>
          <div class="collapsible-body">
            <div class="scroll-area calls-scroll" role="region" aria-label="Tool calls within response (each in its own section)">
              {#each req.response.copilotFunctionCalls as call, ci}
                {#key ci}
                <section class="toolcall-section {current.callIndex === ci ? 'active' : ''}" id={'resp-fncall-' + ci} data-call-id={call.id || call.tool_call_id || call.toolCallId || ('idx_' + ci)}>
                  <header class="toolcall-head">
                    <div class="tool-title-area">
                      <h5 class="no-transform">Call {ci + 1}: {call.name}</h5>
                      {#if current.callIndex === ci}<span class="selected-badge">Active</span>{/if}
                    </div>
                  </header>
                  <ToolCallArgs {call} reqIndex={current.requestIndex} callIndex={ci} />
                  {#if call.id || call.tool_call_id || call.toolCallId || true}
                    {#if $toolCallResults[call.id || call.tool_call_id || call.toolCallId || ('idx_' + ci)]?.text}
                      {#if resultOpen[call.id || call.tool_call_id || call.toolCallId || ('idx_' + ci)] !== false}
                        <div class="tool-result-block open" aria-label="Tool call result output">
                          <div class="tool-result-head-row">
                            <div class="tool-result-head">Result</div>
                            <button class="result-toggle" type="button" on:click={() => toggleResultById(call.id || call.tool_call_id || call.toolCallId || ('idx_' + ci))}>Hide</button>
                          </div>
                          <pre class="code-block small">{$toolCallResults[call.id || call.tool_call_id || call.toolCallId || ('idx_' + ci)].text}</pre>
                        </div>
                      {:else}
                        <div class="tool-result-block collapsed" aria-label="Tool call result output hidden">
                          <div class="tool-result-head-row">
                            <div class="tool-result-head">Result (hidden)</div>
                            <button class="result-toggle" type="button" on:click={() => toggleResultById(call.id || call.tool_call_id || call.toolCallId || ('idx_' + ci))}>Show</button>
                          </div>
                        </div>
                      {/if}
                    {:else}
                      <div class="tool-result-block empty" aria-label="Tool call result output missing"><em class="text-soft">No result output located for this call id</em></div>
                    {/if}
                  {/if}
                </section>
                {/key}
              {/each}
            </div>
          </div>
        </details>
      </section>
    {/if}

    <!-- Usage Statistics -->
    {#if req.response.usage}
      <section class="group usage-group">
        <details class="collapsible" data-role="usage" aria-label="Usage statistics group">
          <summary><span class="caret"></span><h3>Usage Statistics</h3></summary>
          <div class="collapsible-body">
            <pre class="code-block">{JSON.stringify(req.response.usage, null, 2)}</pre>
          </div>
        </details>
      </section>
    {/if}
  {:else}
    <div class="empty-response">
      <em class="text-soft">No response data available</em>
    </div>
  {/if}
</section>

<style>
/* Main section layout */
.main-section {
  margin-bottom: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--color-surface), rgba(255,255,255,0.3));
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(90deg, var(--color-accent-soft), rgba(255,255,255,0.4));
  border-bottom: 1px solid var(--color-border);
}

.section-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-accent);
  letter-spacing: 0.3px;
}

.section-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-info {
  font-size: 0.75rem;
  color: var(--color-text-soft);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.response-section .section-header {
  background: linear-gradient(90deg, #ecfdf5, rgba(255,255,255,0.4));
}

.response-section .section-header h2 {
  color: #059669;
}

.main-section .group {
  margin: 0;
  padding: 0 16px 12px;
}

.main-section .group:first-of-type {
  padding-top: 12px;
}

.empty-response {
  padding: 40px 20px;
  text-align: center;
  font-style: italic;
}

.toolcall-section { 
  border:1px solid var(--color-border); 
  border-radius: var(--radius-sm); 
  padding:8px 10px 12px; 
  background:linear-gradient(180deg,var(--color-surface),rgba(255,255,255,0.55)); 
  box-shadow: var(--shadow-sm); 
}
.toolcall-section.active { border-color: var(--color-warning); box-shadow:0 0 0 2px rgba(234,179,8,.25); }
.toolcall-head { display:flex; align-items:center; justify-content:space-between; margin:0 0 6px; }
.tool-title-area { display:flex; align-items:center; gap:10px; }
.toolcall-head h5 { margin:0; font-size:.72rem; letter-spacing:.5px; font-weight:700; }
.toolcall-head h5.no-transform { text-transform: none; }
.result-toggle { background: var(--color-accent-soft); color: var(--color-accent); border:1px solid var(--color-accent); font-size:.55rem; font-weight:600; letter-spacing:.4px; padding:4px 8px; border-radius: var(--radius-pill); cursor:pointer; }
.result-toggle:hover { background: var(--color-accent); color:#fff; }
@media (prefers-color-scheme: dark) {
  .result-toggle { background:rgba(56,189,248,0.15); color: var(--color-accent); }
  .result-toggle:hover { background: var(--color-accent); color:#0c1a23; }
}
.tool-result-block { margin-top:6px; border:1px solid var(--color-border); border-radius: var(--radius-sm); background:rgba(0,0,0,0.02); padding:6px 8px 8px; }
.tool-result-block.empty { background:transparent; border-style:dashed; }
.tool-result-block.collapsed { background:rgba(0,0,0,0.015); border-style:dashed; padding:6px 8px; }
.tool-result-head { font-size:.55rem; text-transform:uppercase; letter-spacing:.6px; font-weight:700; color: var(--color-text-soft); margin:0 0 4px; }
.tool-result-head-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 4px; }
/* Horizontal scroll for tool result content (no forced wrapping) */
.tool-result-block pre.code-block.small {
  white-space: pre; /* preserve original line structure */
  overflow-x: auto;
  overflow-y: auto;
  word-break: normal;
  overflow-wrap: normal;
  max-width: 100%;
}
/* Improve scroll visibility */
.tool-result-block pre.code-block.small::-webkit-scrollbar { height:8px; }
.tool-result-block pre.code-block.small::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 6px; }
.tool-result-block pre.code-block.small::-webkit-scrollbar-thumb:hover { background: var(--color-border-strong); }
@media (prefers-color-scheme: dark) {
  .tool-result-block { background:rgba(255,255,255,0.06); }
  .tool-result-block.empty { background:transparent; }
}

.selected-badge { color: var(--color-warning); font-weight:600; font-size:.7rem; }

/* Collapsible sections (rounded container remains on open) */
details.collapsible { margin:0 0 10px; padding:0; border:1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); box-shadow: var(--shadow-sm); overflow:hidden; }
details.collapsible > summary { list-style:none; cursor:pointer; padding:8px 12px; display:flex; align-items:center; gap:8px; user-select:none; position:relative; outline:none; }
details.collapsible > summary::-webkit-details-marker { display:none; }
details.collapsible[open] { animation: expandFade .25s ease; }
details.collapsible .collapsible-body { padding:10px 14px 12px; display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--color-border); }
details.collapsible h3 { font-size:.85rem; margin:0; font-weight:600; letter-spacing:.4px; display:flex; align-items:center; gap:8px; }
.count-badge { background: var(--color-accent-soft); color: var(--color-accent); padding:2px 8px; border-radius: var(--radius-pill); font-size:.6rem; font-weight:600; letter-spacing:.5px; }
.caret { width:10px; height:10px; border-right:2px solid var(--color-text-soft); border-bottom:2px solid var(--color-text-soft); transform: rotate(-45deg); transition: transform .25s; margin-right:2px; flex-shrink:0; }
details.collapsible[open] > summary .caret { transform: rotate(45deg); }
details.collapsible > summary:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }

.code-block, pre { background: var(--color-code-bg); color: var(--color-code-text); padding:10px 12px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size:.8rem; line-height:1.4; overflow:auto; position:relative; border:1px solid var(--color-border); white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere; }

.scroll-area { overflow:auto; padding-right:6px; scrollbar-width: thin; }
.scroll-area::-webkit-scrollbar { width:8px; }
.scroll-area::-webkit-scrollbar-thumb { background: var(--color-border); border-radius:20px; }
.scroll-area::-webkit-scrollbar-thumb:hover { background: var(--color-border-strong); }
.calls-scroll { overflow:auto; }

  /* Enhanced response metadata styles */
  .response-meta-table { display:flex; flex-direction:column; gap:4px; font-size:.6rem; }
  .response-meta-table .meta-row { display:grid; grid-template-columns: 110px 1fr 38px; gap:6px; align-items:center; background:rgba(0,0,0,0.02); padding:4px 8px; border:1px solid var(--color-border); border-radius:6px; }
  .response-meta-table .meta-cell.key { font-weight:600; letter-spacing:.5px; text-transform:uppercase; font-size:.5rem; color: var(--color-text-soft); }
  .response-meta-table .meta-cell.val { font-family: var(--font-mono); font-size:.6rem; }
  .response-meta-table .meta-cell.action { display:flex; justify-content:flex-end; }
  .meta-badge { display:inline-block; padding:3px 6px; border-radius:12px; font-weight:600; font-size:.55rem; letter-spacing:.4px; background: var(--color-accent-soft); color: var(--color-accent); text-transform:uppercase; }
  .reason-badge { display:inline-block; padding:3px 6px; border-radius:12px; font-weight:600; font-size:.55rem; letter-spacing:.4px; background:#e0f2fe; color:#0369a1; text-transform:uppercase; }
  .reason-badge.reason-stop { background:#dcfce7; color:#166534; }
  .id-frag { background:rgba(0,0,0,0.05); padding:2px 5px; border-radius:4px; font-size:.55rem; letter-spacing:.3px; }
  .id-frag.full { white-space:normal; word-break:break-all; display:inline-block; max-width:100%; }
  .meta-missing { opacity:.5; }
  .copy-btn { background: var(--color-accent-soft); color: var(--color-accent); border:1px solid var(--color-accent); padding:2px 6px; font-size:.55rem; border-radius:4px; cursor:pointer; font-weight:600; }
  .copy-btn:hover { background: var(--color-accent); color:#fff; }
  .meta-actions-row { display:flex; gap:8px; margin-top:8px; }
  .mini-btn.alt { background: var(--color-border); color: var(--color-text-soft); border:1px solid var(--color-border-strong); }
  .mini-btn.alt:hover { background: var(--color-accent-soft); color: var(--color-accent); }
  @media (prefers-color-scheme: dark) {
    .response-meta-table .meta-row { background:rgba(255,255,255,0.05); border-color: var(--color-border-strong); }
    .id-frag { background:rgba(255,255,255,0.08); }
    .meta-badge { background:rgba(56,189,248,0.18); color: var(--color-accent); }
    .reason-badge { background:rgba(34,197,94,0.18); color:#4ade80; }
    .reason-badge.reason-stop { background:rgba(34,197,94,0.25); color:#4ade80; }
    .copy-btn { background:rgba(56,189,248,0.15); color: var(--color-accent); border-color: var(--color-accent); }
    .copy-btn:hover { background: var(--color-accent); color:#0c1a23; }
  }

@keyframes expandFade { from { opacity:0.6; } to { opacity:1; } }

@media (prefers-color-scheme: dark) {
  .main-section {
    background: linear-gradient(180deg, #1f2730, rgba(30,39,49,0.3));
    border-color: var(--color-border-strong);
  }
  
  .section-header {
    background: linear-gradient(90deg, rgba(56,189,248,0.15), rgba(30,39,49,0.4));
    border-bottom-color: var(--color-border-strong);
  }
  
  .response-section .section-header {
    background: linear-gradient(90deg, rgba(34,197,94,0.15), rgba(30,39,49,0.4));
  }
  
  .response-section .section-header h2 {
    color: #4ade80;
  }
  
  details.collapsible { background:#1f2730; border-color: var(--color-border-strong); }
  details.collapsible .collapsible-body { border-top:1px solid var(--color-border-strong); }
  .caret { border-color: var(--color-text-soft); }
  .toolcall-section { background:rgba(255,255,255,0.03); border-color: var(--color-border-strong); }
  .toolcall-section.active { background:#3a2d06; }
}
</style>
