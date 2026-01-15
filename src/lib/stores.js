import { writable, derived, get } from 'svelte/store';
import { hashColor, safeArray } from './utils.js';
import { colorForTool } from './toolColors.js';
// Special override color for failed responses
const FAILED_REQUEST_COLOR = '#dc2626';
const CONVERSATION_SUMMARY_COLOR = '#9333ea'; // unique purple used only for conversation summary pseudo tool
const INFERRED_TOOL_COLOR = '#7c3aed'; // unified purple for all inferred tool names

export const requests = writable([]); // raw loaded request objects
export const functionCalls = writable([]); // flattened calls + placeholders
export const fileFormat = writable('unknown'); // Track the detected file format: 'sim-requests', 'fetchlog', 'new-agent', 'unknown'
//
// Data shapes used by the UI
//
// `requests` (Array)
// - Each entry is a “request/turn” object from the input file, normalized as needed.
// - Common fields used by the UI:
//   - requestMessages?: Array<{ role: 'system'|'user'|'assistant'|'tool', content: any, tool_call_id?: string, tool_calls?: any[] }>
//   - messages?: same as requestMessages (fetchlog input; normalized into requestMessages)
//   - requestOptions?: { tools?: any[], functions?: any[], copilotFunctions?: any[] }
//   - response?: {
//       type?: 'success'|'failed'|'tool_calls'|string,
//       value?: string[],
//       requestId?: string,
//       copilotFunctionCalls?: Array<{ name: string, arguments: string, id?: string }>, // sim-requests + new-agent normalization
//       toolCalls?: Array<{ id?: string, function?: { name: string, arguments: any } }>, // fetchlog
//     }
//
// `functionCalls` (Array)
// - Flattened list used for navigation (one entry per tool call + synthetic placeholders).
// - Each item looks like:
//   {
//     requestIndex: number,          // index into `requests`
//     callIndex: number,             // index within this request’s tool calls (or -1 for synthetic)
//     name: string,                  // tool/function name (may be inferred)
//     arguments: string|null,        // JSON string arguments when available
//     id: string|undefined,          // tool_call id (used to map results)
//     request: object,               // pointer to the request object
//     hasFunction: boolean,
//     color: string,
//     inferred?: boolean,
//     synthetic?: boolean,
//     conversationSummary?: boolean,
//   }
//
// Note on formats:
// - sim-requests: tool calls are in response.copilotFunctionCalls
// - fetchlog: tool calls are in response.toolCalls (normalized to match shape)
// - new-agent: tool calls are embedded in requestMessages as assistant.tool_calls; we normalize into response.copilotFunctionCalls
//   and de-dupe by tool call id because later prompts repeat earlier tool calls.
//
// selection: callIndex for full list navigation, totalAll for convenience
export const selection = writable({ callIndex: 0, totalAll: 0 });
// filterIndex: index within filteredIndices array ( -1 when not applicable or current call not inside filter )
export const filterIndex = writable(-1);
export const filters = writable({ fn: '', response: '' });

// Derived filtered indices
export const filteredIndices = derived([
  functionCalls,
  filters
], ([$calls, $filters]) => {
  const fnTerm = $filters.fn.trim().toLowerCase();
  const respTerm = $filters.response.trim().toLowerCase();
  if (!fnTerm && !respTerm) return [];
  const matches = [];
  $calls.forEach((c, i) => {
    let ok = true;
    if (fnTerm) ok = ok && c.name.toLowerCase().includes(fnTerm);
    if (respTerm) {
      let accum = '';
      if (c.request?.response?.value) accum += c.request.response.value.join(' ');
      if (c.request?.response?.copilotFunctionCalls) {
        c.request.response.copilotFunctionCalls.forEach(fc => { accum += ' ' + (fc.arguments || ''); });
      }
      if (c.request?.requestMessages) {
        c.request.requestMessages.forEach(m => {
          if (Array.isArray(m.content)) m.content.forEach(ct => { if (ct.text) accum += ' ' + ct.text; });
        });
      }
      ok = ok && accum.toLowerCase().includes(respTerm);
    }
    if (ok) matches.push(i);
  });
  return matches;
});

// Active list (filtered intersection or full)
export const activeList = derived([
  functionCalls, filteredIndices
], ([$calls, $filtered]) => $filtered.length ? $filtered : $calls.map((_, i) => i));

// Grouped function calls by request/roundtrip
export const groupedCalls = derived([
  functionCalls, filteredIndices
], ([$calls, $filtered]) => {
  // groupedCalls shape (Array)
  //   [{ requestIndex: number, request: requests[requestIndex], calls: Array<functionCalls[i] + { originalIndex: i }> }, ...]
  // Grouping key is requestIndex (i.e., “one frame per request/turn”).
  const activeIndices = $filtered.length ? $filtered : $calls.map((_, i) => i);
  const groups = new Map();
  
  activeIndices.forEach(callIndex => {
    const call = $calls[callIndex];
    const requestIndex = call.requestIndex;
    
    if (!groups.has(requestIndex)) {
      groups.set(requestIndex, {
        requestIndex,
        calls: [],
        request: call.request
      });
    }
    
    groups.get(requestIndex).calls.push({
      ...call,
      originalIndex: callIndex
    });
  });
  
  return Array.from(groups.values()).sort((a, b) => a.requestIndex - b.requestIndex);
});

// Check if there's exactly one function call per request (hide request frame when true)
export const shouldHideRequestFrame = derived([
  requests, functionCalls
], ([$requests, $calls]) => {
  // If no requests, don't hide frame
  if (!$requests.length) return false;
  
  // Count function calls per request
  const callsPerRequest = new Map();
  
  // Initialize all requests with 0 calls
  $requests.forEach((_, index) => {
    callsPerRequest.set(index, 0);
  });
  
  // Count actual function calls per request
  $calls.forEach(call => {
    if (call.hasFunction) {
      const currentCount = callsPerRequest.get(call.requestIndex) || 0;
      callsPerRequest.set(call.requestIndex, currentCount + 1);
    }
  });
  
  // Hide frame when ALL requests have exactly 1 function call OR no function calls (treated as 1)
  return Array.from(callsPerRequest.values()).every(count => count === 0 || count === 1);
});

// Mapping of tool call id -> aggregated tool output (text)
export const toolCallResults = derived([
  requests
], ([$requests]) => {
  // toolCallResults shape (Object)
  //   { [toolCallId: string]: { parts: string[], text: string, requestId?: string } }
  // Built from requestMessages/tool messages (role === 'tool') and keyed by tool_call_id.
  const map = {};
  if (!Array.isArray($requests)) return map;
  for (const req of $requests) {
    const msgs = req?.requestMessages;
    if (!Array.isArray(msgs)) continue;
    for (const m of msgs) {
      if (m?.role !== 'tool') continue;
      const id = m.tool_call_id || m.id || m.toolCallId;
      if (!id) continue;
      // If we've already captured an output for this id, skip further accumulation per user request
      if (map[id]?.text) continue;
      const parts = [];
      const content = m.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c === 'string') parts.push(c);
          else if (c?.text) parts.push(c.text);
          else parts.push(JSON.stringify(c));
        }
      } else if (typeof content === 'string') {
        parts.push(content);
      } else if (content?.text) {
        parts.push(content.text);
      }
      map[id] = { parts, text: parts.join('\n'), requestId: req?.response?.requestId };
    }
  }
  return map;
});

// Keep filterIndex in sync when filteredIndices or selection changes
filteredIndices.subscribe(fList => {
  let currentSelection;
  selection.subscribe(s => currentSelection = s)();
  if (fList.length === 0) {
    filterIndex.set(-1);
    return;
  }
  const pos = fList.indexOf(currentSelection.callIndex);
  filterIndex.set(pos); // will be -1 if not in filtered set
});

// When selection changes (e.g., full navigation), update filterIndex accordingly
selection.subscribe(sel => {
  let fList;
  filteredIndices.subscribe(fl => fList = fl)();
  if (!fList || fList.length === 0) {
    filterIndex.set(-1);
    return;
  }
  const pos = fList.indexOf(sel.callIndex);
  filterIndex.set(pos);
});

export function selectCall(idx) {
  selection.update(s => ({ ...s, callIndex: idx }));
  // Attempt to scroll directly to the tool call block in the ResponseDetail component.
  // Fallback: scroll the main content container if specific element not yet rendered.
  setTimeout(() => {
    try {
      const calls = get(functionCalls);
      const fc = calls[idx];
      if (fc && typeof fc.callIndex === 'number' && fc.callIndex >= 0) {
        const headAnchorId = 'resp-fnhead-' + fc.callIndex;
        const sectionAnchorId = 'resp-fncall-' + fc.callIndex;
        const target = document.getElementById(headAnchorId) || document.getElementById(sectionAnchorId);
        if (target) {
          target.scrollIntoView({ behavior: 'auto', block: 'center' });
          return; // success
        }
        // Retry a few times if not yet in DOM (due to async render)
        let attempts = 0;
        const retry = () => {
          attempts++;
            const t2 = document.getElementById(headAnchorId) || document.getElementById(sectionAnchorId);
            if (t2) {
              t2.scrollIntoView({ behavior: 'auto', block: 'center' });
              return;
            }
            if (attempts < 5) setTimeout(retry, 80);
            else {
              const fallback = document.querySelector('.main-content');
              if (fallback) fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        retry();
      } else {
        const fallback = document.querySelector('.main-content');
        if (fallback) fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      const fallback = document.querySelector('.main-content');
      if (fallback) fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 60);
}

// Full list navigation (ignores filters)
export function navigateFullPrev() {
  selection.update(sel => {
    if (sel.callIndex > 0) return { ...sel, callIndex: sel.callIndex - 1 };
    return sel;
  });
}
export function navigateFullNext() {
  selection.update(sel => {
    if (sel.callIndex < sel.totalAll - 1) return { ...sel, callIndex: sel.callIndex + 1 };
    return sel;
  });
}

// Filtered navigation (operates only within filteredIndices)
export function navigateFilteredPrev() {
  let fList; let fIdx;
  filteredIndices.subscribe(fl => fList = fl)();
  filterIndex.subscribe(fi => fIdx = fi)();
  if (!fList || fList.length === 0 || fIdx === -1) return;
  if (fIdx > 0) {
    const target = fList[fIdx - 1];
    selection.update(sel => ({ ...sel, callIndex: target }));
  }
}
export function navigateFilteredNext() {
  let fList; let fIdx;
  filteredIndices.subscribe(fl => fList = fl)();
  filterIndex.subscribe(fi => fIdx = fi)();
  if (!fList || fList.length === 0 || fIdx === -1) return;
  if (fIdx < fList.length - 1) {
    const target = fList[fIdx + 1];
    selection.update(sel => ({ ...sel, callIndex: target }));
  }
}

// ========== Format Detection ==========
function detectFormat(req) {
  // VS Code new agent result format: each entry carries a top-level `name` and includes `requestMessages`.
  // Tool calls (if any) are embedded in assistant messages as `tool_calls`.
  // NOTE: Some entries may have no tool calls; we still treat them as new-agent when `name` is present.
  if (req?.name && Array.isArray(req?.requestMessages)) {
    return 'new-agent';
  }

  // sim-requests format: has response.copilotFunctionCalls
  if (req.response?.copilotFunctionCalls && Array.isArray(req.response.copilotFunctionCalls)) {
    return 'sim-requests';
  }
  
  // fetchlog format: has response.toolCalls (not copilotFunctionCalls)
  if (req.response?.toolCalls && Array.isArray(req.response.toolCalls)) {
    return 'fetchlog';
  }
  
  // Fallback based on field presence
  if (req.response?.copilotFunctionCalls) return 'sim-requests';
  if (req.requestId && req.messages) return 'fetchlog';
  if (req.requestMessages) return 'sim-requests';
  
  return 'unknown';
}

function isNewAgentResultFile(dataArray) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return false;
  // Strict rule (per requirement): new-agent file iff EVERY entry has a top-level `name`.
  return dataArray.every(r => typeof r?.name === 'string' && r.name.length > 0);
}

function extractEmbeddedToolCallsFromMessages(req) {
  const msgs = safeArray(req?.requestMessages);
  // In new-agent logs, requestMessages typically contains full conversation history.
  // We only want the tool_calls that belong to ONE assistant tool_calls block (the latest one).
  // This prevents mixing tool_calls from different assistant messages into a single request.
  let latestAssistantWithToolCalls = null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.role !== 'assistant') continue;
    const tcs = safeArray(m?.tool_calls);
    if (tcs.length) {
      latestAssistantWithToolCalls = m;
      break;
    }
  }

  if (!latestAssistantWithToolCalls) return [];

  const out = [];
  const seenIds = new Set();
  const tcs = safeArray(latestAssistantWithToolCalls?.tool_calls);
  for (const tc of tcs) {
    const id = tc?.id || tc?.tool_call_id || tc?.toolCallId;
    // Ensure each id only appears once within this tool_calls block.
    if (id && seenIds.has(id)) continue;
    const fn = tc?.function || tc?.fn || {};
    const name = fn?.name || tc?.name || 'Unknown';
    const rawArgs = fn?.arguments ?? tc?.arguments;
    const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {});
    if (id) seenIds.add(id);
    out.push({ name, arguments: argsStr, id });
  }
  return out;
}

// ========== sim-requests Format Parser ==========
function parseSimRequestsFormat(req) {
  // In sim-requests, tool calls are in response.copilotFunctionCalls
  const calls = safeArray(req.response?.copilotFunctionCalls);
  
  return calls.map(call => ({
    name: call.name || 'Unknown',
    arguments: call.arguments || '{}',
    id: call.id
  }));
}

// ========== fetchlog Format Parser ==========
function parseFetchlogFormat(req) {
  // fetchlog format has response.toolCalls array
  const toolCalls = safeArray(req.response?.toolCalls);
  
  // Map fetchlog toolCalls format: { type: "function", function: { name, arguments }, id }
  return toolCalls.map((tc) => {
    const name = tc?.function?.name || 'Unknown';
    const rawArgs = tc?.function?.arguments;
    const argsStr = typeof rawArgs === 'string' 
      ? rawArgs 
      : JSON.stringify(rawArgs || {});
    
    return {
      name,
      arguments: argsStr,
      id: tc?.id
    };
  });
}

// ========== Normalize fetchlog Request ==========
// fetchlog stores assistant content in messages array, we need to extract it to response.value
// NOTE: In fetchlog format, when response.type is "tool_calls", the assistant message may NOT
// be in the current request's messages array. Instead, it appears in the NEXT request's messages
// as part of conversation history. So pure tool-call responses will have empty response.value.
function normalizeFetchlogRequest(req, allRequests = [], currentIndex = 0) {
  if (!req.messages || !Array.isArray(req.messages)) return req;
  
  // Extract assistant's text content from messages
  const assistantContents = [];
  for (const msg of req.messages) {
    if (msg?.role === 'assistant') {
      // In fetchlog, assistant message has content (text) AND may have tool_calls
      if (typeof msg.content === 'string' && msg.content.trim()) {
        assistantContents.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (typeof part === 'string' && part.trim()) {
            assistantContents.push(part);
          } else if (part?.text && part.text.trim()) {
            assistantContents.push(part.text);
          }
        }
      }
    }
  }
  
  // Get unified tools from first request that has tools (all requests should use same tools)
  const unifiedTools = (() => {
    // First try current request's tools
    if (req.tools && req.tools.length > 0) return req.tools;
    // Then search through all requests for the first one with tools
    for (const r of allRequests) {
      if (r.tools && r.tools.length > 0) return r.tools;
    }
    return req.requestOptions?.tools || [];
  })();
  
  // For fetchlog format, use a unified requestId to group all requests into one round
  // This makes the UI simpler and matches the actual conversation flow
  const unifiedRequestId = 'fetchlog-unified-conversation';
  
  // Create normalized request with response.value for consistency with sim-requests format
  // If no assistant content found AND response type is tool_calls, leave value empty/undefined
  // so that Response Text section won't show (it's a pure tool call response)
  const normalized = {
    ...req,
    response: {
      ...req.response,
      value: assistantContents.length > 0 ? assistantContents : (req.response?.value || undefined),
      // Use unified requestId for all fetchlog requests to show as single round
      requestId: unifiedRequestId
    },
    // Also copy messages to requestMessages for tool output lookup compatibility
    requestMessages: req.messages,
    // Use unified tools for all requests to ensure consistency
    requestOptions: {
      ...req.requestOptions,
      tools: unifiedTools
    }
  };
  
  return normalized;
}

// ========== Normalize new-agent Requests ==========
// New-agent logs store tool calls inside requestMessages as assistant.tool_calls, and repeat the full
// conversation history on each entry. This function normalizes such logs into a shape compatible with
// the existing UI by synthesizing response.copilotFunctionCalls.
//
// Key behavior:
// - Preserve grouping within a single assistant tool_calls block: if one assistant message has
//   tool_calls [A,B], we emit copilotFunctionCalls [A,B] together.
// - Flatten across multiple assistant tool_calls blocks: if a single entry contains multiple assistant
//   messages with tool_calls, we split into multiple synthetic requests (one per assistant tool_calls block).
// - De-dupe across the entire file by tool_call id because later entries repeat earlier tool calls.
function normalizeNewAgentRequests(data) {
  const seenToolCallIds = new Set();
  const expanded = [];

  for (const req of data) {
    const msgs = safeArray(req?.requestMessages);
    let pushedAny = false;

    for (const m of msgs) {
      if (m?.role !== 'assistant') continue;
      const tcs = safeArray(m?.tool_calls);
      if (!tcs.length) continue;

      // Extract calls from THIS ONE assistant tool_calls block (no cross-message mixing)
      const out = [];
      const seenIdsInBlock = new Set();
      for (const tc of tcs) {
        const id = tc?.id || tc?.tool_call_id || tc?.toolCallId;
        if (id && seenIdsInBlock.has(id)) continue;
        const fn = tc?.function || tc?.fn || {};
        const name = fn?.name || tc?.name || 'Unknown';
        const rawArgs = fn?.arguments ?? tc?.arguments;
        const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {});
        if (id) seenIdsInBlock.add(id);
        out.push({ name, arguments: argsStr, id });
      }

      // File-level de-dupe by tool call id (later entries repeat earlier tool calls)
      const newCalls = [];
      for (const c of out) {
        const id = c?.id;
        if (!id) {
          // If id missing, treat as unique (can't reliably map/dedupe)
          newCalls.push(c);
          continue;
        }
        if (seenToolCallIds.has(id)) continue;
        seenToolCallIds.add(id);
        newCalls.push(c);
      }

      if (!newCalls.length) continue;
      pushedAny = true;

      expanded.push({
        ...req,
        response: {
          ...(req.response || {}),
          copilotFunctionCalls: newCalls
        }
      });
    }

    // If this entry introduced no new tool calls, still keep a request so the UI can show the turn.
    if (!pushedAny) {
      expanded.push({
        ...req,
        response: {
          ...(req.response || {}),
          copilotFunctionCalls: []
        }
      });
    }
  }

  return expanded;
}

// ========== Universal Tool Call Extractor ==========
function extractToolCalls(req) {
  const format = detectFormat(req);
  
  switch (format) {
    case 'sim-requests':
      return parseSimRequestsFormat(req);
    case 'fetchlog':
      return parseFetchlogFormat(req);
    case 'new-agent':
      // For new-agent files, `loadDataFromText` is responsible for normalizing embedded tool calls
      // into response.copilotFunctionCalls and de-duping across the file.
      // Always trust the normalized field if it's present (even if empty), otherwise we could
      // accidentally re-read historical tool_calls from requestMessages.
      if (Array.isArray(req?.response?.copilotFunctionCalls)) {
        return parseSimRequestsFormat(req);
      }
      return extractEmbeddedToolCallsFromMessages(req);
    default:
      console.warn('Unknown format for request:', req);
      return [];
  }
}

export function loadDataFromText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const match = text.match(/\[\s*\{/s);
    if (!match) {
      console.error('No JSON array found');
      return;
    }
  }
  if (!Array.isArray(data)) {
    // attempt fallback extraction
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      try { data = JSON.parse(jsonMatch[0]); } catch (e) { console.error('Failed to parse extracted JSON'); return; }
    }
  }
  if (!Array.isArray(data)) return;

  // Detect format (file-level, because new-agent entries repeat history)
  const format = isNewAgentResultFile(data)
    ? 'new-agent'
    : (data.length > 0 ? detectFormat(data[0]) : 'unknown');
  console.log(`[Format Detection] Detected format: ${format}`);
  
  // Store the detected format
  fileFormat.set(format);

  // Normalize requests:
  // - fetchlog: unify message fields and response.value
  // - new-agent: synthesize per-prompt response.copilotFunctionCalls from embedded requestMessages assistant.tool_calls,
  //              and de-duplicate tool call ids across requests (later prompts repeat earlier tool calls).
  const normalizedData = (() => {
    if (format === 'fetchlog') {
      return data.map((req, idx) => normalizeFetchlogRequest(req, data, idx));
    }
    if (format === 'new-agent') {
      return normalizeNewAgentRequests(data);
    }
    return data;
  })();
  
  requests.set(normalizedData);
  
  // build flattened calls
  const flattened = [];
  normalizedData.forEach((req, rIndex) => {
    const getTextFromContent = (content) => {
      if (!content) return '';
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map(c => (typeof c === 'string' ? c : (c?.text || ''))).join('');
      }
      if (typeof content === 'object' && typeof content.text === 'string') return content.text;
      return '';
    };

    const getFirstUserPromptText = (request) => {
      const messages = request?.requestMessages || request?.messages;
      if (!Array.isArray(messages)) return '';
      for (const m of messages) {
        if (m?.role !== 'user') continue;
        const txt = getTextFromContent(m.content);
        if (txt && txt.trim()) return txt.trim();
      }
      return '';
    };

    const firstUserPrompt = getFirstUserPromptText(req);
    const summarizePrefix = 'Summarize the following actions in 6-7 words using past tense';
    const isSummarizeRequest = typeof firstUserPrompt === 'string' && firstUserPrompt.startsWith(summarizePrefix);

    // Detect special analyze-files system message (works for both formats)
    const hasAnalyzeFilesSystemMsg = (() => {
      const target = 'You are an expert at analyzing files and patterns.';
      // Check in both requestMessages (sim-requests) and messages (fetchlog)
      const messages = req.requestMessages || req.messages;
      if (!messages) return false;
      for (const m of messages) {
        if (m?.role !== 'system') continue;
        
        // Handle both string content (fetchlog) and array content (sim-requests)
        if (typeof m.content === 'string') {
          if (m.content.includes(target)) return true;
        } else if (Array.isArray(m.content)) {
          for (const c of m.content) {
            const txt = (typeof c === 'string' ? c : c?.text) || '';
            if (txt.includes(target)) return true;
          }
        }
      }
      return false;
    })();
    
    // Detect patch-like response (*** Begin Patch ... *** End Patch) for patch_file inference
    const responseJoined = Array.isArray(req?.response?.value) ? req.response.value.join('\n') : (req?.response?.value || '');
    const hasPatchBlock = typeof responseJoined === 'string' && /\*\*\* Begin Patch[\s\S]*\*\*\* End Patch/.test(responseJoined);
    
    // Extract tool calls using format-specific parser
    const calls = extractToolCalls(req);
    
    if (calls.length) {
      calls.forEach((call, ci) => {
        // For new-agent logs: attach response.value only to the LAST tool call in this request.
        // This matches the actual conversation flow (assistant text comes after all tool calls).
        const shouldKeepResponseValue = format !== 'new-agent' || ci === calls.length - 1;
        const reqForCall = shouldKeepResponseValue
          ? req
          : {
              ...req,
              response: {
                ...(req.response || {}),
                value: undefined
              }
            };

        let rawName = call.name || call.function?.name || 'Unknown Function';
        // Normalize 'none' when special system message present
        let inferred = false;
        if (hasAnalyzeFilesSystemMsg && rawName && rawName.toLowerCase() === 'none') {
          rawName = 'analyze_files_and_patterns';
          inferred = true;
        } else if (hasPatchBlock && rawName && rawName.toLowerCase() === 'none') {
          rawName = 'patch_file';
          inferred = true;
        }
        const nm = rawName;
  let clr = colorForTool(nm) || hashColor(nm);
  const failed = req?.response?.type === 'failed';
  if (inferred && !failed) clr = INFERRED_TOOL_COLOR;
  if (failed) clr = FAILED_REQUEST_COLOR;
        flattened.push({
          requestIndex: rIndex,
          callIndex: ci,
          name: nm,
          arguments: call.arguments,
          id: call.id,
          request: reqForCall,
          hasFunction: true,
          color: clr,
          inferred
        });
      });
    } else {
      // No function calls: decide between conversation summary pseudo-tool, analyze_files_and_patterns synthetic, or 'None'
      const responseValue = Array.isArray(req?.response?.value) ? req.response.value.join('\n') : (req?.response?.value || '');
      const isConversationSummary = typeof responseValue === 'string' && responseValue.trim().startsWith('<analysis>');
      if (isConversationSummary) {
        let clr = CONVERSATION_SUMMARY_COLOR;
        if (req?.response?.type === 'failed') clr = FAILED_REQUEST_COLOR; // failed overrides purple
        flattened.push({
          requestIndex: rIndex,
          callIndex: -1,
          name: 'conversation_summary',
          arguments: null,
            request: req,
            hasFunction: true, // treat as tool for color preservation
            conversationSummary: true,
            color: clr
        });
      } else if (isSummarizeRequest) {
        // Synthesize summarize pseudo-tool for special summarization prompts
        let clr = CONVERSATION_SUMMARY_COLOR;
        if (req?.response?.type === 'failed') clr = FAILED_REQUEST_COLOR;
        flattened.push({
          requestIndex: rIndex,
          callIndex: -1,
          name: 'summarize',
          arguments: null,
          request: req,
          hasFunction: true,
          conversationSummary: true,
          synthetic: true,
          color: clr
        });
      } else if (hasAnalyzeFilesSystemMsg) {
        // Synthesize analyze_files_and_patterns pseudo-tool to satisfy display requirement
  let clr = colorForTool('analyze_files_and_patterns');
  const failed = req?.response?.type === 'failed';
  if (!failed) clr = INFERRED_TOOL_COLOR; else clr = FAILED_REQUEST_COLOR;
        flattened.push({
          requestIndex: rIndex,
          callIndex: -1,
          name: 'analyze_files_and_patterns',
          arguments: null,
          request: req,
          hasFunction: true, // mark as function so color refresh uses palette
          synthetic: true,
          inferred: true,
          color: clr
        });
      } else if (hasPatchBlock) {
        // Synthesize patch_file pseudo-tool if patch content but no calls
  let clr = colorForTool('patch_file');
  const failed = req?.response?.type === 'failed';
  if (!failed) clr = INFERRED_TOOL_COLOR; else clr = FAILED_REQUEST_COLOR;
        flattened.push({
          requestIndex: rIndex,
          callIndex: -1,
          name: 'patch_file',
          arguments: null,
          request: req,
          hasFunction: true,
          synthetic: true,
          inferred: true,
          color: clr
        });
      } else {
  let noneColor = '#000000';
  if (req?.response?.type === 'failed') noneColor = FAILED_REQUEST_COLOR; // highlight failed even if no tool
        flattened.push({
          requestIndex: rIndex,
          callIndex: -1,
          name: 'None',
          arguments: null,
          request: req,
          hasFunction: false,
          color: noneColor
        });
      }
    }
  });
  functionCalls.set(flattened);
  selection.set({ callIndex: 0, totalAll: flattened.length });
  filterIndex.set(flattened.length ? -1 : -1);
}

// Recalculate colors for existing calls (e.g., after changing color palettes or system tool list)
export function refreshToolColors() {
  functionCalls.update(list => list.map(c => {
  const failed = c.request?.response?.type === 'failed';
    if (c.conversationSummary) {
      return { ...c, color: failed ? FAILED_REQUEST_COLOR : CONVERSATION_SUMMARY_COLOR };
    }
    if (!c.hasFunction) return { ...c, color: failed ? FAILED_REQUEST_COLOR : '#000000' }; // None placeholder
    if (c.inferred && !failed) {
      return { ...c, color: INFERRED_TOOL_COLOR };
    }
    if (c.name === 'analyze_files_and_patterns' || c.name === 'patch_file') {
      const base = colorForTool(c.name);
      return { ...c, color: failed ? FAILED_REQUEST_COLOR : base };
    }
    const base = colorForTool(c.name) || c.color;
    return { ...c, color: failed ? FAILED_REQUEST_COLOR : base };
  }));
}
