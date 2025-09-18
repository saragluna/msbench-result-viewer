<script>
  export let value = '';
  export let placeholder = '';
  export const type = 'function'; // Used for external reference
  function onInput(e){ value = e.target.value; }
  function clear(){ value=''; }
</script>
<div class="search-bar">
  <input {placeholder} bind:value on:input={onInput} />
  {#if value}<button class="clear" on:click={clear}>✕</button>{/if}
</div>
<style>
/* Defer visual styling to app.css for consistency across contexts */
.search-bar { position:relative; width:100%; }
input { width:100%; }
</style>
