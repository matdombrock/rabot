<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  let collapsed = true;
  export let title = "";
  export let icon = "";
  export let description = "";
  export let expanded = false;
  export let collapseAll = false;
  export let collapsedState = undefined;
  export let forceOpen = 0;

  // On initial mount or collapseAll transition, collapse
  let lastCollapseAll = false;
  $: {
    if (collapseAll && !lastCollapseAll) {
      collapsed = true;
    } else if (!collapseAll && collapsedState !== undefined) {
      collapsed = collapsedState;
    }
    lastCollapseAll = collapseAll;
  }

  $: if (expanded && !collapseAll) collapsed = false;
  // Force open when forceOpen counter changes (handles re-selection)
  $: if (forceOpen) collapsed = false;

  function toggle() {
    collapsed = !collapsed;
    dispatch('collapsedStateChange', collapsed);
  }
</script>

<div class="card" class:collapsed>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="card-header" on:click={toggle}>
    <h2>{#if icon}<i class="fa-solid {icon}"></i> {/if}{title}</h2>
    <span class="collapse-icon">{collapsed ? '▾' : '▴'}</span>
  </div>
  <div class="card-body" class:collapsed>
    {#if description}
      <p class="card-desc">{description}</p>
    {/if}
    <slot />
  </div>
</div>

<style>
  .card {
    background: var(--surface);
    border-radius: 8px;
    padding: 0;
    margin-bottom: 0;
  }
  .card-body {
    padding: 0 1rem 1rem;
  }
  @media (max-width: 640px) {
    .card-body {
      padding: 0 0.75rem 0.75rem;
    }
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
    padding: 0.75rem 1rem;
    border-radius: 8px;
  }
  .card-header:hover { background: var(--surface-alt); }
  .card-header h2 {
    margin-bottom: 0;
    color: var(--text-muted);
    font-size: 1rem;
    word-break: break-word;
    hyphens: auto;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .card-header h2 i {
    width: 1rem;
    text-align: center;
    font-size: 0.85rem;
    opacity: 0.6;
  }
  .card-desc {
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    opacity: 0.65;
    line-height: 1.4;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--surface-alt);
  }
  .collapse-icon {
    color: var(--text-muted);
    font-size: 0.85rem;
    flex-shrink: 0;
    margin-left: 0.5rem;
  }
  .card-body.collapsed { display: none; }
</style>
