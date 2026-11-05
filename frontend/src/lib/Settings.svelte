<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let settings = {};
  export let guildId = '';

  function update(key, value) {
    dispatch('change', { key, value });
  }

  function resetOrder() {
    if (confirm('Reset pane order to default?')) {
      dispatch('resetOrder');
    }
  }

  function resetAllData() {
    if (!confirm('Reset all dashboard data? This will clear pane order, collapsed states, guild ID, and all settings.')) return;
    if (!confirm('This cannot be undone. Continue?')) return;
    dispatch('resetAll');
  }
</script>

<div class="settings">
  <h3 class="settings-section-title">Dashboard</h3>
  <div class="setting-row">
    <div class="setting-info">
      <span class="setting-label">Show Tips</span>
      <span class="setting-desc">Display pane descriptions and tips</span>
    </div>
    <label class="toggle">
      <input type="checkbox" checked={settings.showTips !== false} on:change={(e) => update('showTips', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <div class="setting-row action-row">
    <div class="setting-info">
      <span class="setting-label">Reset Pane Order</span>
      <span class="setting-desc">Restore the default pane arrangement</span>
    </div>
    <button class="btn-sm" on:click={resetOrder}>Reset</button>
  </div>

  <div class="setting-row action-row danger">
    <div class="setting-info">
      <span class="setting-label">Reset All Data</span>
      <span class="setting-desc">Clear all local settings, pane state, and guild selection</span>
    </div>
    <button class="btn-sm btn-danger" on:click={resetAllData}>Reset All</button>
  </div>

  <h3 class="settings-section-title" style="margin-top:1.25rem">Bot</h3>
  <div class="setting-row">
    <div class="setting-info">
      <span class="setting-label">Placeholder</span>
      <span class="setting-desc">This setting does nothing yet</span>
    </div>
    <label class="toggle">
      <input type="checkbox" checked={false} disabled />
      <span class="toggle-slider"></span>
    </label>
  </div>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .settings-section-title {
    font-size: 0.85rem;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.75rem;
    background: var(--background);
    border-radius: 6px;
    gap: 0.75rem;
  }
  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
    flex: 1;
  }
  .setting-label {
    font-size: 0.9rem;
    color: var(--text);
    font-weight: 500;
  }
  .setting-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .setting-row.danger {
    border: 1px solid var(--danger);
  }
  .toggle {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }
  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--surface-alt);
    border-radius: 10px;
    transition: background 0.2s;
  }
  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 2px;
    bottom: 2px;
    background: var(--text-muted);
    border-radius: 50%;
    transition: transform 0.2s, background 0.2s;
  }
  .toggle input:checked + .toggle-slider {
    background: var(--primary);
  }
  .toggle input:checked + .toggle-slider::before {
    transform: translateX(16px);
    background: var(--text-bright);
  }
  .toggle input:disabled + .toggle-slider {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
