import { writable, derived, get } from 'svelte/store';
import { hashColor, parseJSONStrict, safeArray } from './utils.js';
import { colorForTool } from './toolColors.js';
// Special override color for failed responses
const FAILED_REQUEST_COLOR = '#dc2626';
const CONVERSATION_SUMMARY_COLOR = '#9333ea'; // unique purple used only for conversation summary pseudo tool
const INFERRED_TOOL_COLOR = '#7c3aed'; // unified purple for all inferred tool names

export const requests = writable([]); // raw loaded request objects
export const functionCalls = writable([]); // flattened calls + placeholders
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
        const anchorId = 'resp-fncall-' + fc.callIndex;
        const target = document.getElementById(anchorId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return; // success
        }
        // Retry a few times if not yet in DOM (due to async render)
        let attempts = 0;
        const retry = () => {
          attempts++;
            const t2 = document.getElementById(anchorId);
            if (t2) {
              t2.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  requests.set(data);
  // build flattened calls
  const flattened = [];
  data.forEach((req, rIndex) => {
    // Detect special analyze-files system message
    const hasAnalyzeFilesSystemMsg = (() => {
      const target = 'You are an expert at analyzing files and patterns.';
      if (!req?.requestMessages) return false;
      for (const m of req.requestMessages) {
        if (m?.role !== 'system' || !Array.isArray(m.content)) continue;
        for (const c of m.content) {
          const txt = (typeof c === 'string' ? c : c?.text) || '';
          if (txt.trim() === target) return true;
        }
      }
      return false;
    })();
  // Detect patch-like response (*** Begin Patch ... *** End Patch) for patch_file inference
  const responseJoined = Array.isArray(req?.response?.value) ? req.response.value.join('\n') : (req?.response?.value || '');
  const hasPatchBlock = typeof responseJoined === 'string' && /\*\*\* Begin Patch[\s\S]*\*\*\* End Patch/.test(responseJoined);
    const calls = safeArray(req.response?.copilotFunctionCalls);
    if (calls.length) {
      calls.forEach((call, ci) => {
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
          request: req,
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
