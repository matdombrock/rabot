<script>
  let collapsed = false;
  export let title = "";
  export let expanded = false;

  $: if (expanded) collapsed = false;

  function toggle() {
    collapsed = !collapsed;
  }
</script>

<div class="card">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="card-header" on:click={toggle}>
    <h2>{title}</h2>
    <span class="collapse-icon">{collapsed ? '▾' : '▴'}</span>
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
  @media (max-width: 640px) {
    .card {
      padding: 1rem;
    }
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    cursor: pointer;
    user-select: none;
  }
  .card-header:hover { opacity: 0.8; }
  .card-header h2 {
    margin-bottom: 0;
    color: var(--text-muted);
    font-size: 1rem;
    word-break: break-word;
    hyphens: auto;
  }
  .collapse-icon {
    color: var(--text-muted);
    font-size: 0.85rem;
    flex-shrink: 0;
    margin-left: 0.5rem;
  }
  .card-body.collapsed { display: none; }
</style>
