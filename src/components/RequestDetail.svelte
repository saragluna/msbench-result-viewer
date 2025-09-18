<script>
  import { functionCalls, selection, shouldHideRequestFrame } from '../lib/stores.js';
  import ResponseDetail from './ResponseDetail.svelte';

  $: current = $functionCalls[$selection.callIndex];
  $: req = current && current.request;
  $: hideFrame = $shouldHideRequestFrame;

  let copied = false;
  let copyError = false;
  let copyTimer;

  // Group messages by role for layout separation
  $: systemMessages = req?.requestMessages?.filter(m => m.role === 'system') || [];
  $: userMessages = req?.requestMessages?.filter(m => m.role === 'user') || [];

  function buildRawPayload() {
    if (!req) return '';
    // Provide both the original request object and response for completeness
    try {
      return JSON.stringify({ request: req, response: req.response }, null, 2);
    } catch (e) {
      return '/* Failed to serialize request */';
    }
  }

  async function copyRaw() {
    const text = buildRawPayload();
    copyError = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback using a temporary textarea
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.top = '-2000px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
        document.body.removeChild(ta);
      }
      copied = true;
    } catch (err) {
      console.warn('Copy failed', err);
      copyError = true;
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copied = false; copyError = false; }, 1800);
  }

  // Extract function / tool names from request options for concise display
  $: optionNames = (() => {
    const opts = req?.requestOptions;
    if (!opts) return [];
    const names = new Set();
    // Common OpenAI style: tools: [{type:'function', function:{ name }}]
    if (Array.isArray(opts.tools)) {
      for (const t of opts.tools) {
        if (t?.function?.name) names.add(t.function.name);
        else if (t?.name) names.add(t.name);
      }
    }
    // Plain functions array: [{ name, description }]
    if (Array.isArray(opts.functions)) {
      for (const f of opts.functions) {
        if (f?.name) names.add(f.name);
      }
    }
    // Copilot specific field variant
    if (Array.isArray(opts.copilotFunctions)) {
      for (const cf of opts.copilotFunctions) {
        if (cf?.name) names.add(cf.name);
      }
    }
    // Fallback: if a single functionDefinition present
    if (opts.functionDefinition?.name) names.add(opts.functionDefinition.name);
    return Array.from(names);
  })();
  let showRawOptions = false;
  
  // Normalized list of tool/function definitions for the Tools section
  $: toolDefs = (() => {
    const opts = req?.requestOptions;
    if (!opts) return [];
    const byName = new Map();
    function ensurePush(obj) {
      if (!obj?.name || byName.has(obj.name)) return;
      byName.set(obj.name, obj);
    }
    // OpenAI style tools array
    if (Array.isArray(opts.tools)) {
      for (const t of opts.tools) {
        if (t?.function?.name) {
          ensurePush({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
            kind: t.type || 'function',
            raw: t
          });
        } else if (t?.name) {
          ensurePush({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            kind: t.type || 'tool',
            raw: t
          });
        }
      }
    }
    // Generic functions array
    if (Array.isArray(opts.functions)) {
      for (const f of opts.functions) {
        if (f?.name) {
          ensurePush({
            name: f.name,
            description: f.description,
            parameters: f.parameters || f.parametersSchema,
            kind: 'function',
            raw: f
          });
        }
      }
    }
    // Copilot-specific functions
    if (Array.isArray(opts.copilotFunctions)) {
      for (const cf of opts.copilotFunctions) {
        if (cf?.name) {
          ensurePush({
            name: cf.name,
            description: cf.description,
            parameters: cf.parameters || cf.parametersSchema,
            kind: 'copilotFunction',
            raw: cf
          });
        }
      }
    }
    // Single functionDefinition fallback
    if (opts.functionDefinition?.name) {
      const fd = opts.functionDefinition;
      ensurePush({
        name: fd.name,
        description: fd.description,
        parameters: fd.parameters,
        kind: 'functionDefinition',
        raw: fd
      });
    }
    return Array.from(byName.values());
  })();
  // Tool selection state (reverted to prior chip + detail pattern)
  let selectedToolIdx = null; // index into toolDefs
  let showRawTool = false; // toggle for raw JSON of selected tool

  // Build paired tool calls (assistant issued tool_calls + corresponding tool outputs) from request messages
  $: toolCallPairs = (() => {
    if (!req?.requestMessages) return [];
    const msgs = req.requestMessages;
    const toolOutputs = new Map(); // id -> array of text parts
    // Collect tool outputs first
    for (const m of msgs) {
      if (m.role === 'tool') {
        const id = m.tool_call_id || m.id;
        if (!id) continue;
        const parts = [];
        if (Array.isArray(m.content)) {
          for (const c of m.content) {
            if (typeof c === 'string') parts.push(c);
            else if (c?.text) parts.push(c.text);
            else parts.push(JSON.stringify(c));
          }
        } else if (typeof m.content === 'string') {
          parts.push(m.content);
        } else if (m.content?.text) {
          parts.push(m.content.text);
        }
        if (!toolOutputs.has(id)) toolOutputs.set(id, []);
        toolOutputs.get(id).push(...parts);
      }
    }
    function countAttachments(m) {
      if (!m?.content) return 0;
      let total = 0;
      for (const c of m.content) {
        let txt = '';
        if (typeof c === 'string') txt = c; else if (c?.text) txt = c.text; else continue;
        // Decode basic HTML entities in case content was escaped
        if (txt && (txt.includes('&lt;attachments') || txt.includes('&lt;attachment'))) {
          txt = txt.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        }
        // Count wrapper plus individual attachment tags for better granularity
        const matches = txt.match(/<attachments>|<attachment\b/gi);
        if (matches) total += matches.length;
      }
      return total;
    }
    function countAttachmentsInString(str) {
      if (!str || typeof str !== 'string') return 0;
      let work = str;
      if (work.includes('&lt;attachments') || work.includes('&lt;attachment')) {
        work = work.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      }
      const matches = work.match(/<attachments>|<attachment\b/gi);
      return matches ? matches.length : 0;
    }
    const pairs = [];
    let roundCounter = 0;
    let lastRoundUserIndex = null;
    for (let mi = 0; mi < msgs.length; mi++) {
      const m = msgs[mi];
      if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        // Find previous user message
        let prevUserIndex = -1;
        for (let j = mi - 1; j >= 0; j--) {
          if (msgs[j].role === 'user') { prevUserIndex = j; break; }
        }
        const prevUser = prevUserIndex >= 0 ? msgs[prevUserIndex] : null;
        const attachmentsFromPrevUser = prevUser ? countAttachments(prevUser) : 0;
        for (const call of m.tool_calls) {
          const id = call.id || call.tool_call_id || call.toolCallId;
          const fn = call.function || call.fn || {};
          const name = fn.name || call.name;
          const argumentsRaw = fn.arguments || call.arguments;
          let argumentsParsed = null;
          if (typeof argumentsRaw === 'string') {
            try { argumentsParsed = JSON.parse(argumentsRaw); } catch {}
          } else if (argumentsRaw && typeof argumentsRaw === 'object') {
            argumentsParsed = argumentsRaw;
          }
          const outputParts = id && toolOutputs.get(id) ? toolOutputs.get(id) : [];
          const attachmentsInArgs = typeof argumentsRaw === 'string' ? countAttachmentsInString(argumentsRaw) : 0;
          const attachmentsTotal = attachmentsFromPrevUser + attachmentsInArgs;
          const pair = { id, name, argumentsRaw, argumentsParsed, outputParts, output: outputParts.join('\n'), prevUserIndex, attachmentsFromPrevUser, attachmentsInArgs, attachmentsTotal, attachmentsCount: attachmentsTotal };
          // Round boundary if attachments appear (either in user message or arguments) and this is first tool call referencing that user prompt or first with args attachments when previous had none
          const last = pairs[pairs.length - 1];
          const isNewUserContext = prevUserIndex !== -1 && prevUserIndex !== lastRoundUserIndex;
          if (attachmentsTotal > 0 && (isNewUserContext || !last || (last && last.attachmentsTotal === 0))) {
            roundCounter += 1;
            pair.isRoundBoundary = true;
            pair.roundNumber = roundCounter;
            lastRoundUserIndex = prevUserIndex;
          } else if (last) {
            pair.roundNumber = last.roundNumber;
          }
          pairs.push(pair);
        }
      }
    }
    // Fallback: if we detected attachments but none marked a round boundary (e.g., heuristic failed), mark the first tool call with attachments
    if (!pairs.some(p => p.isRoundBoundary)) {
      const firstWithAtt = pairs.find(p => (p.attachmentsTotal || 0) > 0);
      if (firstWithAtt) {
        roundCounter = 1;
        firstWithAtt.isRoundBoundary = true;
        firstWithAtt.roundNumber = 1;
        // Propagate round number to subsequent pairs until next boundary (none in fallback scenario)
        let seen = false;
        for (const p of pairs) {
          if (p === firstWithAtt) { seen = true; }
          if (seen && !p.roundNumber) p.roundNumber = 1;
        }
      }
    }

    // If no assistant tool_calls were present but response contains copilotFunctionCalls, synthesize pairs
    if (!pairs.length && Array.isArray(req?.response?.copilotFunctionCalls) && req.response.copilotFunctionCalls.length) {
      const cfcs = req.response.copilotFunctionCalls;
      // Find last user message to associate attachments
      let lastUserIndex = -1;
      for (let j = msgs.length - 1; j >= 0; j--) {
        if (msgs[j].role === 'user') { lastUserIndex = j; break; }
      }
      const lastUser = lastUserIndex >= 0 ? msgs[lastUserIndex] : null;
      const attachmentsFromPrevUser = lastUser ? countAttachments(lastUser) : 0;
      let roundAssigned = false;
      let roundNumber = 0;
      for (let i = 0; i < cfcs.length; i++) {
        const c = cfcs[i];
        const id = c.id || c.tool_call_id || c.callId || ('resp_' + i);
        const name = c.name || (c.function && c.function.name) || 'Unnamed Tool';
        const argumentsRaw = c.arguments || (c.function && c.function.arguments) || '';
        let argumentsParsed = null;
        if (typeof argumentsRaw === 'string') {
          try { argumentsParsed = JSON.parse(argumentsRaw); } catch {}
        } else if (argumentsRaw && typeof argumentsRaw === 'object') {
          argumentsParsed = argumentsRaw;
        }
        const attachmentsInArgs = typeof argumentsRaw === 'string' ? countAttachmentsInString(argumentsRaw) : 0;
        const attachmentsTotal = attachmentsFromPrevUser + attachmentsInArgs;
        const pair = {
          id,
          name,
          argumentsRaw,
            argumentsParsed,
          outputParts: [],
          output: '',
          prevUserIndex: lastUserIndex,
          attachmentsFromPrevUser,
          attachmentsInArgs,
          attachmentsTotal,
          attachmentsCount: attachmentsTotal,
          source: 'response'
        };
        if (!roundAssigned && attachmentsTotal > 0) {
          roundNumber = 1;
          pair.isRoundBoundary = true;
          pair.roundNumber = 1;
          roundAssigned = true;
        } else if (roundAssigned) {
          pair.roundNumber = roundNumber;
        }
        pairs.push(pair);
      }
      // If still no round boundary but attachments existed, force first pair
      if (!pairs.some(p => p.isRoundBoundary) && attachmentsFromPrevUser > 0 && pairs.length) {
        pairs[0].isRoundBoundary = true;
        pairs[0].roundNumber = 1;
        for (let k = 1; k < pairs.length; k++) pairs[k].roundNumber = 1;
      }
    }
    return pairs;
  })();

  function scrollToAnchor(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Regex to quickly detect if a text block contains any special tagged section
  const SPECIAL_TAG_RE = /<(environment_info|workspace_info|context|reminderInstructions|userRequest|instructions|toolUseInstructions|notebookInstructions|outputFormatting|applyPatchInstructions|attachments)>/;

  // --- Beautify user prompt special sections (<environment_info>, <workspace_info>) ---
  function parseSpecialSections(text) {
    if (typeof text !== 'string') return [{ kind: 'other', content: text }];
    // Supported tags we want to highlight specially
  const pattern = /<(environment_info|workspace_info|context|reminderInstructions|userRequest|instructions|toolUseInstructions|notebookInstructions|outputFormatting|applyPatchInstructions|attachments)>([\s\S]*?)<\/\1>/g;
    const segments = [];
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [full, tag, inner] = match;
      if (match.index > lastIndex) {
        const pre = text.slice(lastIndex, match.index);
        if (pre.trim().length) segments.push({ kind: 'other', content: pre });
      }
      let kind;
      switch (tag) {
        case 'environment_info': kind = 'environment'; break;
        case 'workspace_info': kind = 'workspace'; break;
        case 'context': kind = 'context'; break;
        case 'reminderInstructions': kind = 'reminder'; break;
        case 'userRequest': kind = 'userreq'; break;
  case 'instructions': kind = 'instructions'; break;
  case 'toolUseInstructions': kind = 'tooluse'; break;
  case 'notebookInstructions': kind = 'notebook'; break;
  case 'outputFormatting': kind = 'outputfmt'; break;
  case 'applyPatchInstructions': kind = 'applypatch'; break;
  case 'attachments': kind = 'attachments'; break;
        default: kind = 'other';
      }
      segments.push({ kind, content: inner.trim() });
      lastIndex = match.index + full.length;
    }
    if (lastIndex < text.length) {
      const tail = text.slice(lastIndex);
      if (tail.trim().length) segments.push({ kind: 'other', content: tail });
    }
    // If nothing matched, return original
    if (!segments.length) return [{ kind: 'other', content: text }];
    return segments;
  }

  // Replace tabs with two spaces specifically for workspace display
  function formatWorkspace(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\t/g, '  ');
  }

  // --- Raw original prompt toggling (per message) ---
  let systemRawState = {}; // index -> boolean
  let userRawState = {};

  function toggleSystemRaw(i) {
    systemRawState = { ...systemRawState, [i]: !systemRawState[i] };
    console.debug('[toggleSystemRaw]', i, systemRawState[i]);
  }
  function toggleUserRaw(i) {
    userRawState = { ...userRawState, [i]: !userRawState[i] };
    console.debug('[toggleUserRaw]', i, userRawState[i]);
  }

  function rawMessageText(m) {
    if (!m || !m.content) return '';
    try {
      return m.content.map(c => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') {
          if (c.text) return c.text;
          return JSON.stringify(c, null, 2);
        }
        return String(c);
      }).join('\n');
    } catch (e) { return ''; }
  }

  // Copy support for raw original prompt
  let copyingIdx = null; // { type: 'system'|'user', index }
  async function copyOriginal(kind, i, message) {
    const txt = rawMessageText(message);
    try {
      await navigator.clipboard.writeText(txt);
      copyingIdx = kind + '-' + i;
      setTimeout(() => { if (copyingIdx === kind + '-' + i) copyingIdx = null; }, 1600);
    } catch (err) {
      console.warn('Failed to copy raw original', err);
    }
  }
</script>

{#if !current}
  <div class="panel">No selection.</div>
{:else}
  <div class="panel detail-panel">
    <header class="hdr {hideFrame ? 'compact' : ''}">
      <div>
        <span class="rid">Request ID: {req?.response?.requestId || 'N/A'}</span>
        <span class="model-info">Model: {req?.model || 'Unknown'}</span>
      </div>
      <div class="actions">
        <button class="copy-raw-btn" on:click={copyRaw} aria-label="Copy raw request and response" disabled={!req}>
          {#if copyError}
            <span>⚠️ Error</span>
          {:else if copied}
            <span>✓ Copied</span>
          {:else}
            <span>⧉ Copy Raw</span>
          {/if}
        </button>
      </div>
    </header>

    <!-- Request Detail Section -->
    <section class="main-section request-section">
      <header class="section-header">
        <h2>Request Detail</h2>
        <div class="section-meta">
          <span class="section-info">Messages, Tools & Options</span>
        </div>
      </header>

      <!-- System Prompt(s) -->
      {#if systemMessages.length}
        <section class="group system-group">
          <details class="collapsible" data-role="system" aria-label="System prompts group">
            <summary><span class="caret"></span><h3>System Prompt{systemMessages.length > 1 ? 's' : ''} <span class="count-badge">{systemMessages.length}</span></h3></summary>
            <div class="collapsible-body">
              {#each systemMessages as m, i}
                <section class="msg-section role-system">
                  <header class="msg-head">
                    <h4>System Prompt {systemMessages.length > 1 ? i + 1 : ''}</h4>
                    <span class="role-tag">system</span>
                    <button class="raw-toggle-btn" type="button" on:click={(e) => { e.stopPropagation(); toggleSystemRaw(i); }} data-debug={systemRawState[i] ? 'open' : 'closed'}>
                      {systemRawState[i] ? 'Show Beautified' : 'Show Original'}
                    </button>
                  </header>
                  {#if systemRawState[i]}
                    <div class="raw-inline">
                      <div class="raw-inline-actions">
                        <button class="copy-raw-inline" type="button" on:click={(e) => { e.stopPropagation(); copyOriginal('sys', i, m); }}>{copyingIdx === 'sys-' + i ? 'Copied' : 'Copy'}</button>
                      </div>
                      <pre class="code-block raw-full-inline">{rawMessageText(m)}</pre>
                    </div>
                  {:else if m.content?.length}
                    {#each m.content as c}
                      {#if typeof c === 'string' || (c?.text && SPECIAL_TAG_RE.test(c.text))}
                        {#each parseSpecialSections(typeof c === 'string' ? c : c.text) as seg}
                          {#if seg.kind === 'environment'}
                            <div class="special-block env-block" aria-label="Environment Info">
                              <div class="special-block-header">Environment Info</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'workspace'}
                            <div class="special-block ws-block" aria-label="Workspace Info">
                              <div class="special-block-header">Workspace Info</div>
                              <pre class="code-block special">{formatWorkspace(seg.content)}</pre>
                            </div>
                          {:else if seg.kind === 'context'}
                            <div class="special-block ctx-block" aria-label="Context Block">
                              <div class="special-block-header">Context</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'reminder'}
                            <div class="special-block reminder-block" aria-label="Reminder Instructions">
                              <div class="special-block-header">Reminder Instructions</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'userreq'}
                            <div class="special-block userreq-block" aria-label="User Request">
                              <div class="special-block-header">User Request</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'instructions'}
                            <div class="special-block instr-block" aria-label="Instructions">
                              <div class="special-block-header">Instructions</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'tooluse'}
                            <div class="special-block tooluse-block" aria-label="Tool Use Instructions">
                              <div class="special-block-header">Tool Use Instructions</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'notebook'}
                            <div class="special-block notebook-block" aria-label="Notebook Instructions">
                              <div class="special-block-header">Notebook Instructions</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'outputfmt'}
                            <div class="special-block outputfmt-block" aria-label="Output Formatting">
                              <div class="special-block-header">Output Formatting</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'applypatch'}
                            <div class="special-block applypatch-block" aria-label="Apply Patch Instructions">
                              <div class="special-block-header">Apply Patch Instructions</div>
                              <pre class="code-block special">{seg.content}</pre>
                            </div>
                          {:else if seg.kind === 'attachments'}
                            <div class="special-block attachments-block" aria-label="Attachments">
                              <div class="special-block-header">Attachments <span class="inline-note">toggle to view</span></div>
                              <details class="attachments-toggle" open>
                                <summary>Show / Hide Attachments Content</summary>
                                <pre class="code-block special attachments-pre">{seg.content}</pre>
                              </details>
                            </div>
                          {:else}
                            <pre class="code-block">{seg.content}</pre>
                          {/if}
                        {/each}
                      {:else}
                        <pre class="code-block">{c.text ? c.text : JSON.stringify(c, null, 2)}</pre>
                      {/if}
                    {/each}
                  {:else}
                    <em class="text-soft">Empty</em>
                  {/if}
                </section>
              {/each}
            </div>
          </details>
        </section>
      {/if}

      <!-- User Prompt(s) -->
      {#if userMessages.length}
        <section class="group user-group">
          <details class="collapsible" data-role="user" aria-label="User prompts group">
            <summary><span class="caret"></span><h3>User Prompt{userMessages.length > 1 ? 's' : ''} <span class="count-badge">{userMessages.length}</span></h3></summary>
            <div class="collapsible-body user-prompts-wrapper">
              {#each userMessages as m, i}
                <details class="prompt-collapsible role-user" data-kind="user-prompt">
                  <summary>
                    <span class="mini-caret"></span>
                    <h4>User Prompt {userMessages.length > 1 ? i + 1 : ''}</h4>
                    <span class="role-tag">user</span>
                    <button class="raw-toggle-btn inline" type="button" on:click={(e) => { e.stopPropagation(); toggleUserRaw(i); }} data-debug={userRawState[i] ? 'open' : 'closed'}>
                      {userRawState[i] ? 'Hide Original' : 'Show Original'}
                    </button>
                  </summary>
                  <div class="prompt-body">
                    {#if userRawState[i]}
                      <div class="raw-inline">
                        <div class="raw-inline-actions">
                          <button class="copy-raw-inline" type="button" on:click={(e) => { e.stopPropagation(); copyOriginal('user', i, m); }}>{copyingIdx === 'user-' + i ? 'Copied' : 'Copy'}</button>
                        </div>
                        <pre class="code-block raw-full-inline">{rawMessageText(m)}</pre>
                      </div>
                    {:else if m.content?.length}
                      {#each m.content as c}
                        {#if typeof c === 'string' || (c?.text && SPECIAL_TAG_RE.test(c.text))}
                          {#each parseSpecialSections(typeof c === 'string' ? c : c.text) as seg}
                            {#if seg.kind === 'environment'}
                              <div class="special-block env-block" aria-label="Environment Info">
                                <div class="special-block-header">Environment Info</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'workspace'}
                              <div class="special-block ws-block" aria-label="Workspace Info">
                                <div class="special-block-header">Workspace Info</div>
                                <pre class="code-block special">{formatWorkspace(seg.content)}</pre>
                              </div>
                            {:else if seg.kind === 'context'}
                              <div class="special-block ctx-block" aria-label="Context Block">
                                <div class="special-block-header">Context</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'reminder'}
                              <div class="special-block reminder-block" aria-label="Reminder Instructions">
                                <div class="special-block-header">Reminder Instructions</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'userreq'}
                              <div class="special-block userreq-block" aria-label="User Request">
                                <div class="special-block-header">User Request</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'instructions'}
                              <div class="special-block instr-block" aria-label="Instructions">
                                <div class="special-block-header">Instructions</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'tooluse'}
                              <div class="special-block tooluse-block" aria-label="Tool Use Instructions">
                                <div class="special-block-header">Tool Use Instructions</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'notebook'}
                              <div class="special-block notebook-block" aria-label="Notebook Instructions">
                                <div class="special-block-header">Notebook Instructions</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'outputfmt'}
                              <div class="special-block outputfmt-block" aria-label="Output Formatting">
                                <div class="special-block-header">Output Formatting</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'applypatch'}
                              <div class="special-block applypatch-block" aria-label="Apply Patch Instructions">
                                <div class="special-block-header">Apply Patch Instructions</div>
                                <pre class="code-block special">{seg.content}</pre>
                              </div>
                            {:else if seg.kind === 'attachments'}
                              <div class="special-block attachments-block" aria-label="Attachments">
                                <div class="special-block-header">Attachments <span class="inline-note">toggle to view</span></div>
                                <details class="attachments-toggle" open>
                                  <summary>Show / Hide Attachments Content</summary>
                                  <pre class="code-block special attachments-pre">{seg.content}</pre>
                                </details>
                              </div>
                            {:else}
                              <pre class="code-block">{seg.content}</pre>
                            {/if}
                          {/each}
                        {:else}
                          <pre class="code-block">{c.text ? c.text : JSON.stringify(c, null, 4)}</pre>
                        {/if}
                      {/each}
                    {:else}
                      <em class="text-soft">Empty</em>
                    {/if}
                  </div>
                </details>
              {/each}
            </div>
          </details>
        </section>
      {/if}

      <!-- Tool Calls (assistant tool_calls paired with tool outputs) -->
      {#if toolCallPairs.length}
        <section class="group tool-calls-group">
          <details class="collapsible" data-role="tool-calls" aria-label="Tool calls group">
            <summary><span class="caret"></span><h3>Tool Calls <span class="count-badge">{toolCallPairs.length}</span></h3></summary>
            <div class="collapsible-body tool-calls-body" role="region" aria-label="Tool call pairs">
              <div class="tool-call-pairs-wrapper">
  {#each toolCallPairs as tc, ti (tc.id + '-' + ti)}
          <details class="prompt-collapsible tool-call-item" id={'toolcall-' + (tc.id || ti)} data-kind="tool-call-pair" data-round={tc.roundNumber} data-attachments-total={tc.attachmentsTotal} data-attachments-user={tc.attachmentsFromPrevUser} data-attachments-args={tc.attachmentsInArgs}>
                    <summary>
                      <span class="mini-caret"></span>
                      <h4>{tc.name || 'Unnamed Tool'}{tc.id ? ` (${tc.id})` : ''}
                      </h4>
                    </summary>
                    <div class="prompt-body">
                      <div class="tool-call-columns">
                        <div class="tool-call-col args-col">
                          <div class="sub-label-normal">Arguments</div>
                          {#if tc.argumentsParsed}
                            <pre class="code-block small">{JSON.stringify(tc.argumentsParsed, null, 2)}</pre>
                          {:else if tc.argumentsRaw}
                            <pre class="code-block small">{tc.argumentsRaw}</pre>
                          {:else}
                            <em class="text-soft">None</em>
                          {/if}
                        </div>
                        <div class="tool-call-col result-col">
                          <div class="sub-label-normal">Result</div>
                          {#if tc.output}
                            <pre class="code-block small">{tc.output}</pre>
                          {:else}
                            <em class="text-soft">No output found</em>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </details>
                {/each}
              </div>
            </div>
          </details>
        </section>
      {/if}

      <!-- Request Options -->
      <section class="group options-group">
        <details class="collapsible" data-role="options" aria-label="Request options group">
          <summary><span class="caret"></span><h3>Request Options {#if optionNames.length}<span class="count-badge">{optionNames.length}</span>{/if}</h3></summary>
          <div class="collapsible-body">
            {#if req?.requestOptions}
              <div class="tools-section">
                <div class="tools-header-row">
                  <h4 class="tools-heading">Tools {#if toolDefs.length}<span class="count-badge">{toolDefs.length}</span>{/if}</h4>
                  <button class="mini-btn alt" on:click={() => showRawOptions = !showRawOptions}>{showRawOptions ? 'Hide Raw JSON' : 'Show Raw JSON'}</button>
                </div>
                {#if toolDefs.length}
                  <div class="tools-list" role="tablist" aria-label="Available tools">
                    {#each toolDefs as t, i}
                      <button
                        class="tool-chip {selectedToolIdx === i ? 'active' : ''}"
                        role="tab"
                        aria-selected={selectedToolIdx === i}
                        on:click={() => { selectedToolIdx = i; showRawTool = false; }}
                      >{t.name}</button>
                    {/each}
                  </div>
                  {#if selectedToolIdx !== null && toolDefs[selectedToolIdx]}
                    {#key selectedToolIdx}
                      <div class="tool-detail" role="tabpanel" aria-label={toolDefs[selectedToolIdx].name + ' tool details'}>
                        <header class="tool-detail-head">
                          <div class="tool-title-area">
                            <h5>{toolDefs[selectedToolIdx].name}</h5>
                            <span class="tool-kind-tag">{toolDefs[selectedToolIdx].kind}</span>
                          </div>
                          <button class="mini-btn" on:click={() => showRawTool = !showRawTool}>{showRawTool ? 'Hide Raw Definition' : 'Show Raw Definition'}</button>
                        </header>
                        {#if toolDefs[selectedToolIdx].description}
                          <p class="tool-desc">{toolDefs[selectedToolIdx].description}</p>
                        {:else}
                          <p class="tool-desc text-soft"><em>No description</em></p>
                        {/if}
                        {#if toolDefs[selectedToolIdx].parameters}
                          <div class="sub-label">Parameters</div>
                          <pre class="code-block small">{JSON.stringify(toolDefs[selectedToolIdx].parameters, null, 2)}</pre>
                        {/if}
                        {#if showRawTool}
                          <pre class="code-block small" style="margin-top:8px;">{JSON.stringify(toolDefs[selectedToolIdx].raw, null, 2)}</pre>
                        {/if}
                      </div>
                    {/key}
                  {:else}
                    <p class="text-soft" style="margin:10px 0 0; font-size:.7rem;">Select a tool to view its details.</p>
                  {/if}
                {:else}
                  <em class="text-soft">No tools definitions</em>
                {/if}
              </div>

              <!-- Divider -->
              <div class="options-divider"></div>

              <!-- Other Request Options Section -->
              <div class="other-options-section">
                <div class="section-heading">
                  <h4 class="options-heading">Other Request Options</h4>
                </div>
                
                {#if req?.requestOptions && Object.keys(req.requestOptions).filter(key => !['tools', 'tool_choice', 'functions', 'functionDefinition', 'copilotFunctions'].includes(key)).length > 0}
                  <div class="options-list">
                    {#each Object.entries(req.requestOptions).filter(([key]) => !['tools', 'tool_choice', 'functions', 'functionDefinition', 'copilotFunctions'].includes(key)) as [key, value]}
                      <div class="option-item">
                        <div class="option-name">{key}</div>
                        <div class="option-value">
                          {#if value === null}
                            <span class="option-value-null">null</span>
                          {:else if value === undefined}
                            <span class="option-value-undefined">undefined</span>
                          {:else if typeof value === 'boolean'}
                            <span class="option-value-boolean">{String(value)}</span>
                          {:else if typeof value === 'number'}
                            <span class="option-value-number">{String(value)}</span>
                          {:else if Array.isArray(value)}
                            {#if value.length < 3 && value.every(item => typeof item !== 'object')}
                              <span class="option-value-array">[{value.map(String).join(', ')}]</span>
                            {:else}
                              <pre class="code-block small">{JSON.stringify(value, null, 2)}</pre>
                            {/if}
                          {:else if typeof value === 'object'}
                            <pre class="code-block small">{JSON.stringify(value, null, 2)}</pre>
                          {:else if typeof value === 'string'}
                            {#if value.startsWith('http://') || value.startsWith('https://')}
                              <a href={value} target="_blank" rel="noopener noreferrer" class="option-value-url">{value}</a>
                            {:else if value.length > 50}
                              <pre class="code-block small">{value}</pre>
                            {:else}
                              <span class="option-value-text">{value}</span>
                            {/if}
                          {:else}
                            <span class="option-value-text">{String(value)}</span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <em class="text-soft">No additional options</em>
                {/if}
              </div>
              
              {#if showRawOptions}
                <pre class="code-block" style="margin-top:10px;">{JSON.stringify(req.requestOptions, null, 2)}</pre>
              {/if}
            {:else}<em>None</em>{/if}
          </div>
        </details>
      </section>
    </section>

    <!-- Use ResponseDetail component -->
    <ResponseDetail {current} {req} />
  </div>
{/if}

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

.request-section .section-header {
  background: linear-gradient(90deg, #e0f2ff, rgba(255,255,255,0.4));
}

.request-section .section-header h2 {
  color: #0369a1;
}

.main-section .group {
  margin: 0;
  padding: 0 16px 10px;
}

.main-section .group:first-of-type {
  padding-top: 10px;
}

@media (prefers-color-scheme: dark) {
  .main-section {
    background: linear-gradient(180deg, #1f2730, rgba(30,39,49,0.3));
    border-color: var(--color-border-strong);
  }
  
  .section-header {
    background: linear-gradient(90deg, rgba(56,189,248,0.15), rgba(30,39,49,0.4));
    border-bottom-color: var(--color-border-strong);
  }
  
  .request-section .section-header {
    background: linear-gradient(90deg, rgba(14,165,233,0.15), rgba(30,39,49,0.4));
  }
  
  .request-section .section-header h2 {
    color: #38bdf8;
  }
}

/* base container inherits panel styles from global */
.hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid var(--color-border); padding-bottom:8px; }
.hdr.compact { margin-bottom:8px; padding-bottom:6px; }
.detail-panel { max-width:100%; overflow:hidden; }
.detail-panel pre.code-block, .detail-panel pre { max-width:100%; }
.msg-section { border:1px solid var(--color-border); border-radius: var(--radius-sm); padding:10px 12px 12px; background:linear-gradient(180deg,var(--color-surface),rgba(255,255,255,0.55)); box-shadow: var(--shadow-sm); }
/* spacing handled by normal flow inside scroll container; optional adjacency rule removed */
.msg-head { display:flex; align-items:center; justify-content:space-between; margin:0 0 6px; }
.msg-head h4 { margin:0; font-size:.8rem; letter-spacing:.4px; font-weight:600; }
.role-tag { font-size:.55rem; text-transform:uppercase; letter-spacing:.6px; background: var(--color-accent-soft); color: var(--color-accent); padding:4px 6px; border-radius: var(--radius-pill); font-weight:600; }

/* Tools section */
.tools-section { display:flex; flex-direction:column; gap:10px; }
.tools-header-row { display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; }
.tools-header-row .mini-btn { font-size: 0.6rem; padding: 4px 8px; }
.tools-heading { margin:0; font-size:.75rem; letter-spacing:.5px; font-weight:700; color: var(--color-text-soft); }
.tools-list { display:flex; flex-wrap:wrap; gap:8px; }
.tool-chip { background: var(--color-accent-soft); color: var(--color-accent); border:1px solid var(--color-accent); font-size:.6rem; letter-spacing:.4px; font-weight:600; padding:6px 10px; border-radius: var(--radius-pill); cursor:pointer; box-shadow: var(--shadow-xs); transition: background .2s, color .2s, transform .15s; }
.tool-chip:hover { background: var(--color-accent); color:#fff; }
.tool-chip.active { background: var(--color-accent); color:#fff; box-shadow: var(--shadow-sm); }
.tool-detail { border:1px solid var(--color-border); border-radius: var(--radius-sm); padding:10px 12px 12px; background: linear-gradient(180deg,var(--color-surface),rgba(255,255,255,0.55)); box-shadow: var(--shadow-sm); display:flex; flex-direction:column; gap:8px; }
.tool-detail-head { display:flex; align-items:center; justify-content:space-between; }
.tool-title-area { display:flex; align-items:center; gap:10px; }
.tool-detail-head h5 { margin:0; font-size:.8rem; letter-spacing:.4px; font-weight:700; }
.tool-kind-tag { font-size:.5rem; text-transform:uppercase; letter-spacing:.6px; background: var(--color-warning-soft); color: var(--color-warning); padding:4px 6px; border-radius: var(--radius-pill); font-weight:600; }
.tool-desc { margin:0; font-size:.7rem; line-height:1.3; }
.sub-label { margin:4px 0 4px; font-size:.6rem; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color: var(--color-text-soft); }

.sub-label-normal { margin:4px 0 4px; font-size:.6rem; font-weight:700; letter-spacing:.5px; color: var(--color-text-soft); }
.code-block.small { font-size:.6rem; line-height:1.25; }

/* Other Request Options section styles */
.options-divider {
  margin: 14px 0;
  height: 1px;
  background: linear-gradient(90deg, var(--color-border), transparent);
}
.other-options-section { 
  margin-top: 6px;
}
.section-heading {
  margin-bottom: 10px;
}
.options-heading { 
  margin:0; 
  font-size:.75rem; 
  letter-spacing:.5px; 
  font-weight:700; 
  color: var(--color-text-soft); 
}
.options-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.option-item {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.4);
  border: 1px solid var(--color-border);
}
.option-name {
  font-weight: 600;
  font-size: .65rem;
  letter-spacing: .4px;
  color: var(--color-accent);
  margin-bottom: 4px;
}
.option-value {
  font-size: .7rem;
}
.option-value-text {
  font-family: var(--font-mono);
  background: rgba(0,0,0,0.03);
  padding: 2px 4px;
  border-radius: 3px;
  font-size: .65rem;
}
.option-value-url {
  font-family: var(--font-mono);
  color: #2563EB;
  text-decoration: underline;
  font-size: .65rem;
  word-break: break-all;
}
.option-value-boolean {
  font-family: var(--font-mono);
  background: rgba(79, 70, 229, 0.1);
  color: #4F46E5;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: .65rem;
  font-weight: 600;
}
.option-value-number {
  font-family: var(--font-mono);
  background: rgba(16, 185, 129, 0.1);
  color: #10B981;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: .65rem;
}
.option-value-null {
  font-family: var(--font-mono);
  background: rgba(107, 114, 128, 0.1);
  color: #6B7280;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: .65rem;
  font-style: italic;
}
.option-value-undefined {
  font-family: var(--font-mono);
  background: rgba(156, 163, 175, 0.1);
  color: #9CA3AF;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: .65rem;
  font-style: italic;
}
.option-value-array {
  font-family: var(--font-mono);
  background: rgba(239, 68, 68, 0.1);
  color: #EF4444;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: .65rem;
}

@media (prefers-color-scheme: dark) {
  .option-item { 
    background: rgba(255,255,255,0.05);
    border-color: var(--color-border-strong);
  }
  .option-value-text {
    background: rgba(255,255,255,0.07);
  }
  .option-value-boolean {
    background: rgba(79, 70, 229, 0.15);
    color: #818CF8;
  }
  .option-value-number {
    background: rgba(16, 185, 129, 0.15);
    color: #34D399;
  }
  .option-value-null {
    background: rgba(107, 114, 128, 0.15);
    color: #9CA3AF;
  }
  .option-value-undefined {
    background: rgba(156, 163, 175, 0.15);
    color: #D1D5DB;
  }
  .option-value-array {
    background: rgba(239, 68, 68, 0.15);
    color: #F87171;
  }
}

@media (prefers-color-scheme: dark) {
  .tool-detail { background:#1f2730; }
  .tool-chip { background: rgba(56,189,248,0.15); color: var(--color-accent); }
  .tool-chip.active { background: var(--color-accent); color:#0c1a23; }
}

/* Role-specific readable backgrounds */
.msg-section.role-system { background:#f1f5f9; border-left:4px solid #64748b; }

/* Improve role tag contrast */
.msg-section .role-tag { background:rgba(0,0,0,.04); color:#374151; border:1px solid rgba(0,0,0,.08); }
.msg-section.role-system .role-tag { background:#e2e8f0; border-color:#cbd5e1; }

@media (prefers-color-scheme: dark) {
  .msg-section.role-system { background:#25313d; border-left-color:#94a3b8; }
  .msg-section .role-tag { background:rgba(255,255,255,.08); color:#e2e8f0; border:1px solid rgba(255,255,255,.15); }
  .msg-section.role-system .role-tag { background:#314254; border-color:#45576a; }
}

/* Collapsible sections (rounded container remains on open) */
details.collapsible { margin:0 0 10px; padding:0; border:1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); box-shadow: var(--shadow-sm); overflow:hidden; }
details.collapsible > summary { list-style:none; cursor:pointer; padding:8px 12px; display:flex; align-items:center; gap:8px; user-select:none; position:relative; outline:none; }
details.collapsible > summary::-webkit-details-marker { display:none; }
details.collapsible[open] { animation: expandFade .25s ease; }
details.collapsible .collapsible-body { padding:8px 12px 10px; display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--color-border); }
details.collapsible h3 { font-size:.85rem; margin:0; font-weight:600; letter-spacing:.4px; display:flex; align-items:center; gap:8px; }
.count-badge { background: var(--color-accent-soft); color: var(--color-accent); padding:2px 8px; border-radius: var(--radius-pill); font-size:.6rem; font-weight:600; letter-spacing:.5px; }
.caret { width:10px; height:10px; border-right:2px solid var(--color-text-soft); border-bottom:2px solid var(--color-text-soft); transform: rotate(-45deg); transition: transform .25s; margin-right:2px; flex-shrink:0; }
details.collapsible[open] > summary .caret { transform: rotate(45deg); }
details.collapsible > summary:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }

/* Inner message sections inside collapsible inherit container bg; keep subtle separation */
details.collapsible .msg-section { box-shadow:none; background:rgba(255,255,255,0.55); border:1px solid var(--color-border); border-left-width:4px; border-radius: var(--radius-xs); }
details.collapsible .msg-section.role-system { background:#f1f5f9; }
/* Nested per-prompt collapsibles */
.user-prompts-wrapper { display:flex; flex-direction:column; gap:6px; }
details.prompt-collapsible { border:1px solid var(--color-border); border-radius: var(--radius-sm); background:#e0f2ff; padding:0; box-shadow: var(--shadow-sm); overflow:hidden; }
details.prompt-collapsible[open] { background:#d4ecfb; }
details.prompt-collapsible > summary { list-style:none; cursor:pointer; display:flex; align-items:center; gap:8px; padding:6px 10px; position:relative; }
details.prompt-collapsible > summary::-webkit-details-marker { display:none; }
details.prompt-collapsible > summary h4 { margin:0; font-size:.72rem; font-weight:600; letter-spacing:.4px; flex:1; }
.mini-caret { width:8px; height:8px; border-right:2px solid #0b74a3; border-bottom:2px solid #0b74a3; transform: rotate(-45deg); transition: transform .25s; margin-right:2px; }
details.prompt-collapsible[open] > summary .mini-caret { transform: rotate(45deg); }
details.prompt-collapsible .prompt-body { padding:6px 10px 8px; border-top:1px solid var(--color-border); display:flex; flex-direction:column; gap:6px; }
/* Continuation per-message collapsibles reuse prompt-collapsible base with role color variants */
/* Remove inner scroll for tool output code blocks */
details.prompt-collapsible.role-tool .prompt-body .code-block,
details.prompt-collapsible.role-tool .prompt-body pre {
  overflow:visible;
  max-height:none;
}
/* Tool call pairs layout */
.tool-call-pairs-wrapper { display:flex; flex-direction:column; gap:6px; }
details.prompt-collapsible.tool-call-item { background:#fff9e6; }
details.prompt-collapsible.tool-call-item[open] { background:#fff3cf; }
@media (prefers-color-scheme: dark) {
  details.prompt-collapsible.tool-call-item { background:#4a3713; }
  details.prompt-collapsible.tool-call-item[open] { background:#5b4418; }
}
.tool-calls-body { display:flex; flex-direction:column; gap:8px; }
.tool-call-columns { display:flex; flex-wrap:wrap; gap:14px; }
.tool-call-col { flex:1 1 280px; min-width:240px; display:flex; flex-direction:column; gap:6px; }
.tool-call-col .code-block.small { max-height:300px; }
/* Round / attachment debug */
.mini-btn.alt { background: var(--color-border); color: var(--color-text-soft); border:1px solid var(--color-border-strong); font-size:.55rem; padding:4px 8px; border-radius:4px; cursor:pointer; }
.mini-btn.alt:hover { background: var(--color-accent-soft); color: var(--color-accent); }
@media (prefers-color-scheme: dark) {
  details.prompt-collapsible { background:#0d3b52; border-color: var(--color-border-strong); }
  details.prompt-collapsible[open] { background:#114863; }
  .mini-caret { border-color:#38bdf8; }
  details.prompt-collapsible .prompt-body { border-top:1px solid var(--color-border-strong); }
}

/* Special parsed sections for user prompt beautification */
.special-block { border:1px solid var(--color-border); border-radius: var(--radius-sm); background:#ffffff; padding:8px 10px 10px; margin:6px 0 8px; box-shadow: var(--shadow-sm); position:relative; }
.special-block:before { content:""; position:absolute; inset:0; background:linear-gradient(135deg, rgba(0,0,0,0.02), rgba(0,0,0,0)); pointer-events:none; border-radius:inherit; }
.special-block-header { font-size:.58rem; text-transform:uppercase; letter-spacing:.55px; font-weight:700; color: var(--color-text-soft); margin:0 0 6px; display:flex; align-items:center; gap:6px; }
.env-block { border-left:5px solid #0f766e; background: linear-gradient(180deg,#f0fdfa,#ffffff); }
.ws-block { border-left:5px solid #4338ca; background: linear-gradient(180deg,#eef2ff,#ffffff); }
.ctx-block { border-left:5px solid #0891b2; background: linear-gradient(180deg,#ecfeff,#ffffff); }
.reminder-block { border-left:5px solid #d97706; background: linear-gradient(180deg,#fff7ed,#ffffff); }
.userreq-block { border-left:5px solid #6d28d9; background: linear-gradient(180deg,#f5f3ff,#ffffff); }
.instr-block { border-left:5px solid #2563eb; background: linear-gradient(180deg,#eff6ff,#ffffff); }
.tooluse-block { border-left:5px solid #0891b2; background: linear-gradient(180deg,#f0fdff,#ffffff); }
.notebook-block { border-left:5px solid #059669; background: linear-gradient(180deg,#ecfdf5,#ffffff); }
.outputfmt-block { border-left:5px solid #7c3aed; background: linear-gradient(180deg,#f5f3ff,#ffffff); }
.applypatch-block { border-left:5px solid #dc2626; background: linear-gradient(180deg,#fef2f2,#ffffff); }
.attachments-block { border-left:5px solid #0d9488; background: linear-gradient(180deg,#f0fdfa,#ffffff); }
.attachments-block .inline-note { font-weight:600; font-size:.5rem; background:#0d9488; color:#ffffff; padding:2px 6px; border-radius:10px; letter-spacing:.5px; }
.attachments-toggle { margin:4px 0 0; border:1px solid var(--color-border); border-radius:6px; background:rgba(0,0,0,0.03); }
.attachments-toggle > summary { cursor:pointer; list-style:none; font-size:.55rem; font-weight:600; padding:4px 8px; letter-spacing:.5px; }
.attachments-toggle > summary::-webkit-details-marker { display:none; }
.attachments-toggle[open] > summary { border-bottom:1px solid var(--color-border); background:rgba(0,0,0,0.04); }
.attachments-pre { max-height:360px; overflow:auto; }
.special-block pre.special { background:rgba(0,0,0,0.04); margin:0; font-size:.63rem; line-height:1.3; padding:6px 8px; border-radius:4px; color: var(--color-text); }
/* Raw original toggle */
.raw-toggle-btn { background: var(--color-accent-soft); color: var(--color-accent); border:1px solid var(--color-accent); font-size:.55rem; padding:4px 6px; border-radius:4px; cursor:pointer; margin-left:8px; letter-spacing:.4px; font-weight:600; }
.raw-toggle-btn:hover { background: var(--color-accent); color:#fff; }
.raw-toggle-btn.inline { align-self:center; }
.copy-raw-inline { background: var(--color-accent); color:#fff; border:none; font-size:.55rem; padding:3px 6px; border-radius:4px; margin-left:8px; cursor:pointer; letter-spacing:.4px; font-weight:600; }
.copy-raw-inline:hover { background: var(--color-accent-hover); }
/* In-place raw view (replaces beautified) */
.raw-inline { border:1px solid var(--color-border); border-radius: var(--radius-sm); background: linear-gradient(180deg,#ffffff,#f1f5f9); padding:6px 8px 8px; display:flex; flex-direction:column; gap:6px; }
.raw-inline-actions { display:flex; justify-content:flex-end; }
.raw-full-inline { font-size:.62rem; line-height:1.35; margin:0; background:var(--color-code-bg); color:var(--color-code-text); padding:10px 12px; border:1px solid var(--color-border); border-radius:4px; max-height:420px; overflow:auto; }
@media (prefers-color-scheme: dark) {
  .raw-inline { background: linear-gradient(180deg,#1f2730,#25313d); }
  .raw-full-inline { background:#141b22; }
}
@media (prefers-color-scheme: dark) {
  .copy-raw-inline { background: var(--color-accent); color:#0c1a23; }
  .copy-raw-inline:hover { background: var(--color-accent-hover); color:#fff; }
}
@media (prefers-color-scheme: dark) {
  .raw-toggle-btn { background:rgba(56,189,248,0.15); color: var(--color-accent); border-color: var(--color-accent); }
  .raw-toggle-btn:hover { background: var(--color-accent); color:#0c1a23; }
}
@media (prefers-color-scheme: dark) {
  .special-block { background:#1f2733; border-color: var(--color-border-strong); box-shadow:0 1px 2px rgba(0,0,0,.7); }
  .special-block:before { background:linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0)); }
  .special-block-header { color: var(--color-text-soft); }
  .env-block { border-left-color:#14b8a6; background:linear-gradient(180deg,#0f3d45,#1f2733); }
  .ws-block { border-left-color:#6366f1; background:linear-gradient(180deg,#1f2240,#1f2733); }
  .ctx-block { border-left-color:#06b6d4; background:linear-gradient(180deg,#073944,#1f2733); }
  .reminder-block { border-left-color:#f59e0b; background:linear-gradient(180deg,#3b2805,#1f2733); }
  .userreq-block { border-left-color:#8b5cf6; background:linear-gradient(180deg,#2d1b47,#1f2733); }
  .instr-block { border-left-color:#3b82f6; background:linear-gradient(180deg,#102b52,#1f2733); }
  .tooluse-block { border-left-color:#06b6d4; background:linear-gradient(180deg,#073944,#1f2733); }
  .notebook-block { border-left-color:#10b981; background:linear-gradient(180deg,#0d3a2d,#1f2733); }
  .outputfmt-block { border-left-color:#8b5cf6; background:linear-gradient(180deg,#2d1b47,#1f2733); }
  .applypatch-block { border-left-color:#f87171; background:linear-gradient(180deg,#3b1010,#1f2733); }
  .attachments-block { border-left-color:#14b8a6; background:linear-gradient(180deg,#0f3d45,#1f2733); }
  .attachments-block .inline-note { background:#14b8a6; color:#0c1a23; }
  .attachments-toggle { background:rgba(255,255,255,0.04); }
  .attachments-toggle[open] > summary { background:rgba(255,255,255,0.08); }
  .special-block pre.special { background:rgba(255,255,255,0.06); color: var(--color-text); }
}

@keyframes expandFade { from { opacity:0.6; } to { opacity:1; } }

@media (prefers-color-scheme: dark) {
  details.collapsible { background:#1f2730; border-color: var(--color-border-strong); }
  details.collapsible .collapsible-body { border-top:1px solid var(--color-border-strong); }
  .caret { border-color: var(--color-text-soft); }
  details.collapsible .msg-section { background:rgba(255,255,255,0.03); }
  details.collapsible .msg-section.role-system { background:#25313d; }
}
.actions { display:flex; align-items:center; gap:8px; }
.copy-raw-btn { background: var(--color-accent); color:#fff; border:none; font-size:.65rem; padding:8px 10px; border-radius: var(--radius-sm); font-weight:600; letter-spacing:.5px; cursor:pointer; box-shadow: var(--shadow-sm); display:inline-flex; align-items:center; gap:4px; transition: background .2s, box-shadow .2s, transform .15s; }
.copy-raw-btn:hover:not([disabled]) { background: var(--color-accent-hover); box-shadow: var(--shadow-md); }
.copy-raw-btn:active:not([disabled]) { transform: translateY(1px); box-shadow: var(--shadow-sm); }
.copy-raw-btn[disabled] { background: var(--color-border); color: var(--color-text-soft); cursor:not-allowed; box-shadow:none; }
.copy-raw-btn span { line-height:1; }
.rid { font-weight:600; color: var(--color-accent); margin-right:12px; }
.model-info { font-size:.7rem; color: var(--color-text-soft); letter-spacing:.6px; }
.group { margin-top:32px; }
.group h3 { margin:0 0 14px; font-size:1rem; letter-spacing:.4px; }
pre { font-family: var(--font-mono); }
/* Height constraints removed for messages-scroll to allow natural expansion */
.panel { max-width:100%; overflow:hidden; }
.panel .code-block, .panel pre { max-width:100%; overflow:auto; }
</style>
