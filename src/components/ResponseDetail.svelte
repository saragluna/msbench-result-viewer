<script>
  import ToolCallArgs from './ToolCallArgs.svelte';
  import { toolCallResults } from '../lib/stores.js';

  export let current;
  export let req;

  // Detect if request has a system message matching the special analyzer instruction
  $: hasAnalyzeFilesSystemMsg = (() => {
    if (!req?.requestMessages) return false;
    return req.requestMessages.some(m => m.role === 'system' && Array.isArray(m.content) && m.content.some(c => (c?.text || c) === 'You are an expert at analyzing files and patterns.'));
  })();

  // If tool name is 'none' but special system message present, display analyze_files_and_patterns
  function displayToolName(call) {
    if (!call) return '';
    const name = call.name || call.function?.name;
  if ((!name || name.toLowerCase() === 'none') && hasAnalyzeFilesSystemMsg) return 'analyze_files_and_patterns';
  if ((!name || name.toLowerCase() === 'none') && responseTextParts && responseTextParts.length && isPatchLike(responseTextParts[0])) return 'patch_file';
    return name || 'None';
  }

  // Formatted response text: if analyze scenario and looks like patch block, reuse patch formatting from ToolCallArgs logic lightly
  function isPatchLike(text) {
    return typeof text === 'string' && /\*\*\* Begin Patch[\s\S]*\*\*\* End Patch/.test(text);
  }
  function extractPatch(text) {
    if (!isPatchLike(text)) return '';
    const m = text.match(/\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/);
    return m ? m[0] : '';
  }
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
      const mm = line.match(fileHeader);
      if (mm) {
        if (current) blocks.push(current);
        current = { action: mm[1], filePath: mm[2].trim(), body: [] };
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
  $: responseTextParts = req?.response?.value || [];
  $: patchVisualizationBlocks = hasAnalyzeFilesSystemMsg ? responseTextParts.filter(t => isPatchLike(t)).flatMap(t => parsePatchBlocks(extractPatch(t))) : [];

  // --- Fenced code block parsing & JSON pretty display (for analyze_files_and_patterns scenario) ---
  function parseFencedBlocks(text) {
    if (typeof text !== 'string') return [{ type: 'text', content: text }];
    const re = /```(\w+)?\n([\s\S]*?)```/g;
    const out = [];
    let lastIdx = 0; let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIdx) {
        const pre = text.slice(lastIdx, m.index);
        if (pre.trim().length) out.push({ type: 'text', content: pre });
      }
      out.push({ type: 'code', lang: (m[1] || '').toLowerCase(), raw: m[2] });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
      const tail = text.slice(lastIdx);
      if (tail.trim().length) out.push({ type: 'text', content: tail });
    }
    return out.length ? out : [{ type: 'text', content: text }];
  }

  function tryParseJSON(str) {
    try { return JSON.parse(str); } catch { return null; }
  }
  function escapeHTML(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function highlightJSON(value) {
    // Simple syntax highlighter turning JSON value into HTML with spans
    const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return escapeHTML(json).replace(/^(\s*)("[^"]+"?)(:)?(.*)$/gm, (line, indent, key, colon, rest) => {
      let html = indent || '';
      const isKey = /^".*"$/.test(key) && colon;
      if (isKey) html += `<span class=\"j-key\">${escapeHTML(key)}</span>${colon}`;
      else html += `<span class=\"j-lit\">${escapeHTML(key + (colon || ''))}</span>`;
      if (rest) {
        // classify rest (string/number/boolean/null/structure)
        const trimmed = rest.trim();
        let cls = 'j-lit';
        if (/^".*"[,]?$/.test(trimmed)) cls = 'j-str';
        else if (/^(true|false|null)[,]?$/.test(trimmed)) cls = 'j-bool';
        else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?[,]?$/.test(trimmed)) cls = 'j-num';
        else if (/^[\[{]$/.test(trimmed)) cls = 'j-brkt';
        else if (/^[\]}][,]?$/.test(trimmed)) cls = 'j-brkt';
        html += ` <span class=\"${cls}\">${escapeHTML(rest)}</span>`;
      }
      return html;
    });
  }
  // Extract unescaped string snippets from parsed JSON object root (one level)
  function extractMultilineSnippets(obj) {
    if (!obj || typeof obj !== 'object') return [];
    const snippets = [];
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && /\n/.test(v) ) {
        // Already real newlines OR escaped? Convert escaped \n into real newline if present
        let content = v;
        // If the string includes literal backslash-n sequences and very few actual newlines
        const backslashNewlineCount = (content.match(/\\n/g) || []).length;
        if (backslashNewlineCount && backslashNewlineCount > (content.match(/\n/g) || []).length) {
          content = content.replace(/\\n/g, '\n');
        }
        // Remove BOM if present
        content = content.replace(/^\uFEFF/, '');
        snippets.push({ key: k, value: content });
      }
    }
    return snippets;
  }
  $: fencedBlocksPerPart = hasAnalyzeFilesSystemMsg ? responseTextParts.map(p => parseFencedBlocks(p)) : [];
  $: hasAnyFenced = hasAnalyzeFilesSystemMsg && fencedBlocksPerPart.some(list => list.some(seg => seg.type === 'code'));
  let fenceRawState = {}; // key by composite index

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
            {#if hasAnalyzeFilesSystemMsg && patchVisualizationBlocks.length}
              <div class="analyze-files-response" aria-label="Analyze files and patterns formatted output">
                {#each patchVisualizationBlocks as blk, bi}
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
                <details class="raw-response-text" open>
                  <summary>Show Raw Combined Text</summary>
                  <pre class="code-block small" style="margin-top:6px;">{req.response.value.join('\n')}</pre>
                </details>
              </div>
            {:else if hasAnalyzeFilesSystemMsg && hasAnyFenced}
              <div class="analyze-files-response" aria-label="Analyze files and patterns fenced code rendering">
                {#each fencedBlocksPerPart as blocks, pi}
                  {#each blocks as seg, si}
                    {#if seg.type === 'code' && (seg.lang === 'json' || seg.lang === 'javascript' || seg.lang === 'js')}
                      {#if tryParseJSON(seg.raw)}
                        {#key 'json-'+pi+'-'+si}
                          <script context="module"></script>
                          {#await Promise.resolve(tryParseJSON(seg.raw)) then parsed}
                            <div class="json-block" data-lang={seg.lang}>
                              <div class="json-head">
                                <span class="json-label">JSON Block</span>
                                <button type="button" class="mini-btn json-raw-toggle" on:click={() => fenceRawState[pi+'-'+si] = !fenceRawState[pi+'-'+si]}> {fenceRawState[pi+'-'+si] ? 'Pretty' : 'Raw'} </button>
                              </div>
                              {#if fenceRawState[pi+'-'+si]}
                                <pre class="code-block small">{seg.raw}</pre>
                              {:else}
                                <pre class="code-block small json-pre" aria-label="Pretty JSON" >{@html highlightJSON(parsed)}</pre>
                                {#each extractMultilineSnippets(parsed) as snip}
                                  <details class="snippet-details" open>
                                    <summary><span class="snippet-key">{snip.key}</span> <span class="snippet-extra">({snip.value.split('\n').length} lines)</span></summary>
                                    <pre class="code-block tiny" data-snippet-key={snip.key}>{snip.value}</pre>
                                  </details>
                                {/each}
                              {/if}
                            </div>
                          {/await}
                        {/key}
                      {:else}
                        <div class="code-fallback">
                          <div class="code-head"><span class="code-label">{seg.lang || 'code'}</span></div>
                          <pre class="code-block small">{seg.raw}</pre>
                        </div>
                      {/if}
                    {:else if seg.type === 'code'}
                      <div class="code-fallback">
                        <div class="code-head"><span class="code-label">{seg.lang || 'code'}</span></div>
                        <pre class="code-block small">{seg.raw}</pre>
                      </div>
                    {:else if seg.type === 'text'}
                      <pre class="code-block small plain-text">{seg.content}</pre>
                    {/if}
                  {/each}
                {/each}
              </div>
            {:else}
              <pre class="code-block">{req.response.value.join('\n')}</pre>
            {/if}
          </div>
        </details>
      </section>
    {/if}

    <!-- Tool Calls (Response-side) -->
    {#if req.response.copilotFunctionCalls?.length || req.response.toolCalls?.length}
      {@const toolCallsList = req.response.copilotFunctionCalls || req.response.toolCalls || []}
      <section class="group response-calls-group">
        <details class="collapsible" open data-role="response-calls" aria-label="Response tool calls group">
          <summary><span class="caret"></span><h3>Tool Calls <span class="count-badge">{toolCallsList.length}</span></h3></summary>
          <div class="collapsible-body">
            <div class="scroll-area calls-scroll" role="region" aria-label="Tool calls within response (each in its own section)">
              {#each toolCallsList as call, ci}
                {#key ci}
                <section class="toolcall-section {current.callIndex === ci ? 'active' : ''}" id={'resp-fncall-' + ci} data-call-id={call.id || call.tool_call_id || call.toolCallId || ('idx_' + ci)}>
                  <header class="toolcall-head">
                    <div class="tool-title-area">
                      <h5 class="no-transform">Call {ci + 1}: {displayToolName(call)} {#if (hasAnalyzeFilesSystemMsg && (call.name?.toLowerCase?.() === 'none')) || displayToolName(call) === 'patch_file'}<span class="infer-badge" title="Inferred tool name">INFERRED</span>{/if}</h5>
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
/* Inferred badge */
.infer-badge { background:#7c3aed; color:#fff; font-size:.45rem; letter-spacing:.6px; padding:3px 6px; border-radius:10px; font-weight:700; vertical-align:middle; position:relative; top:-1px; }
@media (prefers-color-scheme: dark) { .infer-badge { background:#7c3aed; color:#f1f5f9; } }
/* Analyze files & patterns special formatted output (patch-like reused styles) */
.analyze-files-response { display:flex; flex-direction:column; gap:10px; }
.analyze-files-response .patch-file { border:1px solid #dee2e6; border-radius:6px; background:#f8f9fa; box-shadow:0 1px 2px rgba(0,0,0,0.05); overflow:hidden; }
.analyze-files-response .patch-head { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#e9ecef; border-bottom:1px solid #dee2e6; font-weight:600; font-size:.72rem; font-family:monospace; }
.analyze-files-response .patch-action { text-transform:uppercase; font-size:.55rem; letter-spacing:.6px; padding:3px 6px; border-radius:10px; font-weight:700; }
.analyze-files-response .patch-action.tag-update { background:#dbeafe; color:#1e3a8a; }
.analyze-files-response .patch-action.tag-add { background:#dcfce7; color:#166534; }
.analyze-files-response .patch-action.tag-delete { background:#fee2e2; color:#991b1b; }
.analyze-files-response .patch-path { font-family:monospace; font-size:.6rem; background:#343a40; color:#f8f9fa; padding:3px 6px; border-radius:4px; max-width:60%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.analyze-files-response .patch-code { background:#fff; margin:0; padding:8px 10px; font-family:monospace; font-size:.68rem; line-height:1.25; overflow:auto; max-height:320px; border-top:1px solid #f1f3f5; }
.analyze-files-response .patch-code::-webkit-scrollbar { height:8px; width:8px; }
.analyze-files-response .patch-code::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:6px; }
.analyze-files-response .patch-code::-webkit-scrollbar-thumb:hover { background:#94a3b8; }
.analyze-files-response .patch-deleted-note { padding:10px 12px; font-size:.65rem; font-style:italic; color:#7f1d1d; background:#fff1f2; }
.analyze-files-response .patch-empty { padding:10px; font-size:.65rem; opacity:.6; }
.analyze-files-response :global(.patch-code .pl) { display:block; padding:0 6px; border-left:4px solid transparent; }
.analyze-files-response :global(.patch-code .pl.add) { background:#ecfdf5; color:#065f46; border-left-color:#10b981; }
.analyze-files-response :global(.patch-code .pl.del) { background:#fef2f2; color:#991b1b; border-left-color:#dc2626; }
.analyze-files-response :global(.patch-code .pl.hunk) { background:#eff6ff; color:#1e3a8a; border-left-color:#3b82f6; font-weight:600; }
.analyze-files-response :global(.patch-code .pl.ctx) { color:#374151; }
.analyze-files-response .raw-response-text { border:1px solid var(--color-border); border-radius:6px; background:rgba(0,0,0,0.02); padding:4px 8px 8px; }
.analyze-files-response .raw-response-text > summary { list-style:none; cursor:pointer; font-size:.6rem; font-weight:600; letter-spacing:.5px; }
.analyze-files-response .raw-response-text > summary::-webkit-details-marker { display:none; }
@media (prefers-color-scheme: dark) {
  .analyze-files-response .patch-file { background:#1e293b; border-color:#334155; }
  .analyze-files-response .patch-head { background:#0f172a; border-bottom-color:#334155; }
  .analyze-files-response .patch-path { background:#475569; color:#f1f5f9; }
  .analyze-files-response .patch-code { background:#0f172a; border-top-color:#1e293b; }
  .analyze-files-response :global(.patch-code .pl.ctx) { color:#cbd5e1; }
  .analyze-files-response :global(.patch-code .pl.add) { background:rgba(16,185,129,0.15); color:#6ee7b7; border-left-color:#10b981; }
  .analyze-files-response :global(.patch-code .pl.del) { background:rgba(220,38,38,0.15); color:#fca5a5; border-left-color:#dc2626; }
  .analyze-files-response :global(.patch-code .pl.hunk) { background:rgba(59,130,246,0.18); color:#93c5fd; border-left-color:#3b82f6; }
  .analyze-files-response .patch-deleted-note { background:#7f1d1d; color:#fecaca; }
  .analyze-files-response .raw-response-text { background:rgba(255,255,255,0.06); }
}
/* JSON fenced block formatting */
.json-block { border:1px solid var(--color-border); border-radius:6px; background:rgba(0,0,0,0.02); padding:6px 8px 10px; display:flex; flex-direction:column; gap:6px; }
.json-head { display:flex; align-items:center; justify-content:space-between; }
.json-label { font-size:.55rem; font-weight:700; letter-spacing:.6px; text-transform:uppercase; color: var(--color-text-soft); }
.json-pre { white-space:pre; overflow:auto; max-height:400px; }
.json-pre::-webkit-scrollbar { height:8px; width:8px; }
.json-pre::-webkit-scrollbar-thumb { background: var(--color-border); border-radius:6px; }
.snippet-details { border:1px solid var(--color-border); border-radius:6px; background:rgba(0,0,0,0.03); padding:4px 6px 6px; }
.snippet-details > summary { cursor:pointer; list-style:none; font-size:.55rem; font-weight:600; letter-spacing:.5px; }
.snippet-details > summary::-webkit-details-marker { display:none; }
.snippet-details[open] { background:rgba(0,0,0,0.05); }
.snippet-details pre { margin:6px 0 0; }
.snippet-key { background:#1e3a8a; color:#fff; padding:2px 6px; border-radius:10px; font-size:.5rem; letter-spacing:.5px; }
.snippet-extra { font-size:.5rem; color: var(--color-text-soft); margin-left:6px; }
.code-fallback { border:1px solid var(--color-border); border-radius:6px; padding:6px 8px 8px; background:rgba(0,0,0,0.02); }
.code-head { margin:0 0 4px; font-size:.55rem; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color: var(--color-text-soft); display:flex; align-items:center; gap:6px; }
.code-label { background:#334155; color:#fff; padding:2px 6px; border-radius:10px; font-size:.5rem; letter-spacing:.5px; }
.plain-text { background:rgba(0,0,0,0.02); }
/* JSON syntax colors */
:global(.j-key) { color:#2563eb; font-weight:600; }
:global(.j-str) { color:#047857; }
:global(.j-bool) { color:#be123c; font-weight:600; }
:global(.j-num) { color:#7c2d12; }
:global(.j-brkt) { color:#6b21a8; font-weight:600; }
:global(.j-lit) { color:#374151; }
@media (prefers-color-scheme: dark) {
  .json-block { background:rgba(255,255,255,0.05); }
  .snippet-details { background:rgba(255,255,255,0.04); }
  .snippet-details[open] { background:rgba(255,255,255,0.07); }
  .code-fallback { background:rgba(255,255,255,0.05); }
  .plain-text { background:rgba(255,255,255,0.05); }
  .snippet-key { background:#1e3a8a; }
  :global(.j-key) { color:#60a5fa; }
  :global(.j-str) { color:#34d399; }
  :global(.j-bool) { color:#f87171; }
  :global(.j-num) { color:#fbbf24; }
  :global(.j-brkt) { color:#c084fc; }
  :global(.j-lit) { color:#cbd5e1; }
}
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
