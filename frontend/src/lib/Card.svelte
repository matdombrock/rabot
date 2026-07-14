<script>
  let collapsed = false;
  export let title = "";
  export let expanded = false;

  $: if (expanded) collapsed = false;
</script>

<div class="card">
  <div class="card-header">
    <h2 on:click={() => collapsed = !collapsed} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); collapsed = !collapsed; }}} tabindex="0" role="button">{title}</h2>
    <button class="collapse-btn" on:click={() => collapsed = !collapsed}>
      {collapsed ? '▾' : '▴'}
    </button>
  </div>
  <div class="card-body" class:collapsed>
    <slot />
  </div>
</div>

<style>
  .card {
    background: var(--surface);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .card-header h2 {
    margin-bottom: 0;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 1rem;
  }
  .card-header h2:hover { opacity: 0.8; }
  .collapse-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem;
    line-height: 1;
  }
  .collapse-btn:hover { color: var(--text-bright); background: none; }
  .card-body.collapsed { display: none; }
</style>
