<script>
  import { functionCalls, selection, selectCall, agentFilter, fileFormat } from '../lib/stores.js';
  
  // Get filtered tool calls for the current agent
  $: agentToolCalls = (() => {
    if ($fileFormat !== 'new-agent' || $agentFilter.startIdx === -1 || $agentFilter.endIdx === -1) {
      return [];
    }
    
    return $functionCalls.filter(call => 
      typeof call.requestIndex === 'number' && 
      call.requestIndex >= $agentFilter.startIdx && 
      call.requestIndex <= $agentFilter.endIdx
    );
  })();
  
  // Get the agent name from the first request in the filtered range
  $: agentName = (() => {
    if ($agentFilter.startIdx === -1) return null;
    // Get the request at the start index to find agent name
    const requests = [...$functionCalls];
    const agentCall = requests.find(call => call.requestIndex === $agentFilter.startIdx);
    return agentCall?.request?.name || null;
  })();
  
  function displayCallName(call) {
    if (call.conversationSummary) return 'conversation_summary';
    if (call.synthetic && call.name) return call.name;
    return call.name || 'None';
  }
</script>

{#if agentToolCalls.length > 0}
<section class="agent-toolcalls-section">
  <div class="section-header">
    <h3>Current Agent Tool Calls</h3>
    {#if agentName}
      <span class="agent-badge">{agentName}</span>
    {/if}
  </div>
  <div class="toolcalls-container">
    {#each agentToolCalls as call}
      <button
        class="toolcall-chip"
        class:selected={$selection.callIndex === call.requestIndex * 100 + (call.callIndex || 0)}
        style="--chip-color:{call.color}"
        on:click={() => selectCall($functionCalls.indexOf(call))}
        aria-label={'Tool call ' + (call.name || 'None')}>
        <span class="chip-num">{$functionCalls.indexOf(call) + 1}</span>
        <span class="chip-name">{displayCallName(call)}</span>
        {#if call.inferred}<span class="infer-badge" title="Inferred tool name">∑</span>{/if}
        {#if call.conversationSummary}<span class="summary-emoji" title="Conversation summary">📋</span>{/if}
        {#if call.request?.response?.type === 'failed'}<span class="fail-emoji" title="Failed response">⚠️</span>{/if}
      </button>
    {/each}
  </div>
</section>
{/if}

<style>
.agent-toolcalls-section {
  margin-bottom: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--color-surface), rgba(255,255,255,0.3));
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: linear-gradient(90deg, #dbeafe, rgba(255,255,255,0.6));
  border-bottom: 1px solid var(--color-border);
}

.section-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1e40af;
  letter-spacing: 0.3px;
}

.agent-badge {
  background: #3b82f6;
  color: white;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.toolcalls-container {
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.toolcall-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--chip-color, #6b7280);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

.toolcall-chip:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.toolcall-chip.selected {
  box-shadow: 0 0 0 2px white, 0 0 0 4px var(--chip-color, #6b7280);
  transform: scale(1.05);
}

.chip-num {
  font-weight: 600;
  opacity: 0.9;
}

.chip-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.infer-badge {
  background: rgba(255, 255, 255, 0.3);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.7rem;
}

.summary-emoji,
.fail-emoji {
  font-size: 0.9rem;
}

@media (prefers-color-scheme: dark) {
  .agent-toolcalls-section {
    background: linear-gradient(180deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.3));
  }
  
  .section-header {
    background: linear-gradient(90deg, rgba(30, 58, 138, 0.3), rgba(30, 41, 59, 0.4));
  }
  
  .section-header h3 {
    color: #93c5fd;
  }
}
</style>
