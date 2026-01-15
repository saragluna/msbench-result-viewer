<script>
  import { requests, selection, selectCall, functionCalls } from '../lib/stores.js';
  import { onMount, tick } from 'svelte';

  // Group requests by agent name to show agent switching
  $: agentGroups = (() => {
    const groups = [];
    let currentAgent = null;
    let currentGroup = null;

    $requests.forEach((req, idx) => {
      const agentName = req?.name || 'default agent';
      
      if (agentName !== currentAgent) {
        // New agent, create new group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentAgent = agentName;
        currentGroup = {
          agentName,
          requests: [{ req, idx }],
          startIdx: idx,
          endIdx: idx
        };
      } else {
        // Same agent, add to current group
        currentGroup.requests.push({ req, idx });
        currentGroup.endIdx = idx;
      }
    });

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  })();

  // Find which agent group contains the currently selected call
  $: selectedAgentGroup = (() => {
    const callIdx = $selection.callIndex;
    if (callIdx < 0 || !$functionCalls[callIdx]) return null;
    
    const requestIndex = $functionCalls[callIdx].requestIndex;
    
    for (const group of agentGroups) {
      if (requestIndex >= group.startIdx && requestIndex <= group.endIdx) {
        return group;
      }
    }
    return null;
  })();

  let scrollEl;
  let lastScrolledAgent = null;
  
  async function scrollSelectedIntoView() {
    if (!scrollEl || !selectedAgentGroup) return;
    await tick();
    
    const agentName = selectedAgentGroup.agentName;
    if (agentName === lastScrolledAgent) return;
    lastScrolledAgent = agentName;
    
    // Sanitize agent name for use in CSS selector to prevent CSS injection
    const sanitizedAgentName = agentName.replace(/["'\\]/g, '\\$&');
    const btn = scrollEl.querySelector(`button[data-agent-name="${sanitizedAgentName}"]`);
    if (!btn) return;
    
    const elTop = btn.offsetTop;
    const elBottom = elTop + btn.offsetHeight;
    const viewTop = scrollEl.scrollTop;
    const viewBottom = viewTop + scrollEl.clientHeight;
    
    if (elTop >= viewTop && elBottom <= viewBottom) return; // fully visible
    
    const target = elTop - (scrollEl.clientHeight / 2) + (btn.offsetHeight / 2);
    scrollEl.scrollTo({ top: Math.max(target, 0), behavior: 'smooth' });
  }

  $: if (selectedAgentGroup) {
    scrollSelectedIntoView();
  }

  function selectAgent(group) {
    // Select the first tool call in this agent group
    const firstReq = group.requests[0];
    if (!firstReq) return;
    
    // Find the first function call for this request
    const firstCall = $functionCalls.find(call => call.requestIndex === firstReq.idx);
    if (firstCall) {
      const callIndex = $functionCalls.indexOf(firstCall);
      selectCall(callIndex);
    }
  }

  // Generate color for each agent based on hash
  function agentColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash = hash & hash;
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 55%)`;
  }
</script>

<section class="agent-panel">
  <header class="section-header agent-header">
    <div class="header-title">
      <h2>Agent Switching</h2>
    </div>
    <div class="section-meta">
      <span class="count-badge">{agentGroups.length}</span>
    </div>
  </header>
  
  <div class="agent-scroll" bind:this={scrollEl} role="region" aria-label="Agent switching scroll area">
    <div class="agent-content">
      {#if !agentGroups.length}
        <div class="empty">No agents found.</div>
      {:else}
        <div class="agent-list">
          {#each agentGroups as group, idx (group.agentName + '-' + idx)}
            <button
              class="agent-item"
              class:selected={selectedAgentGroup === group}
              style="--agent-color:{agentColor(group.agentName)}"
              data-agent-name={group.agentName}
              aria-label="Agent {group.agentName}"
              on:click={() => selectAgent(group)}>
              <div class="agent-header-line">
                <span class="agent-num">{idx + 1}</span>
                <span class="agent-name">{group.agentName}</span>
              </div>
              <div class="agent-meta">
                <span class="agent-requests">{group.requests.length} request{group.requests.length === 1 ? '' : 's'}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
.agent-panel {
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--color-surface), rgba(255,255,255,0.3));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  height: 100%;
}

.agent-panel:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

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

.agent-panel .agent-header {
  background: linear-gradient(90deg, #fef3c7, #fafafa);
  border-bottom: 1px solid #e5e7eb;
  position: relative;
}

.agent-panel .agent-header::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  height: 3px;
  width: 100%;
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.agent-panel .section-header.agent-header h2 {
  color: #4b5563 !important;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding-left: 14px;
  position: relative;
}

.agent-panel .section-header.agent-header h2::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 16px;
  background: linear-gradient(180deg, #f59e0b, #d97706);
  border-radius: 3px;
}

.agent-scroll {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1 1 auto;
  height: 100%;
}

.agent-scroll::-webkit-scrollbar {
  width: 8px;
}

.agent-scroll::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 10px;
}

.agent-content {
  padding: 12px 16px 16px;
  background: rgba(255, 255, 255, 0.7);
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-item {
  --_c: var(--agent-color, #666);
  /* Fallback for browsers without color-mix */
  background: linear-gradient(135deg, var(--_c) 0%, var(--_c) 100%);
  /* Modern browsers with color-mix support */
  background: linear-gradient(135deg, var(--_c) 0%, color-mix(in srgb, var(--_c) 85%, white) 100%);
  /* Fallback border for browsers without color-mix */
  border: 1px solid rgba(0, 0, 0, 0.2);
  /* Modern border with color-mix */
  border: 1px solid color-mix(in srgb, var(--_c) 60%, transparent);
  color: #fff;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition: all 0.2s ease;
  text-align: left;
  width: 100%;
}

.agent-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  filter: brightness(1.1);
}

.agent-item.selected {
  outline: none;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--_c), 0 6px 12px rgba(0, 0, 0, 0.3);
  transform: translateY(-1px) scale(1.02);
  filter: brightness(1.05) saturate(1.15);
}

.agent-header-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-num {
  font-size: 11px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 1px 2px rgba(0, 0, 0, 0.3);
}

.agent-name {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.9);
  padding-left: 30px;
}

.agent-requests {
  font-weight: 500;
}

.count-badge {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.empty {
  font-style: italic;
  color: #666;
  font-size: 0.65rem;
  padding: 4px 2px;
}

@media (prefers-color-scheme: dark) {
  .agent-panel {
    background: linear-gradient(180deg, #1e293b, #0f172a);
    border-color: #334155;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .agent-panel:hover {
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .section-header {
    background: linear-gradient(90deg, rgba(251, 191, 36, 0.15), rgba(15, 23, 42, 0.6));
    border-bottom-color: #334155;
  }

  .section-header::after {
    background: linear-gradient(90deg, #fbbf24, transparent);
  }

  .agent-panel .agent-header {
    background: linear-gradient(90deg, #1e293b, #0f172a);
    border-bottom-color: #334155;
  }

  .agent-panel .agent-header::after {
    background: linear-gradient(90deg, #fbbf24, #f59e0b);
    opacity: 0.8;
  }

  .agent-panel .section-header.agent-header h2 {
    color: #e2e8f0 !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .agent-panel .section-header.agent-header h2::before {
    background: linear-gradient(180deg, #fbbf24, #f59e0b);
  }

  .agent-content {
    background: rgba(30, 41, 59, 0.7);
  }

  .agent-item {
    /* Fallback border for browsers without color-mix */
    border-color: rgba(255, 255, 255, 0.1);
    /* Modern border with color-mix */
    border-color: color-mix(in srgb, var(--_c) 40%, transparent);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .agent-item:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }

  .agent-item.selected {
    box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.7), 0 4px 8px rgba(0, 0, 0, 0.4);
  }

  .agent-num {
    background: rgba(0, 0, 0, 0.35);
  }
}
</style>
