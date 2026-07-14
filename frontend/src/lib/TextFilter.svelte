<script>
  export let guildId = '';

  let filters = [];
  let logs = [];
  let pattern = '';
  let action = 'warn';
  let label = '';

  async function load() {
    if (!guildId) return;
    const r = await fetch(`/api/guild/${guildId}/textfilters`);
    filters = await r.json();
  }

  async function loadLogs() {
    if (!guildId) return;
    const r = await fetch(`/api/guild/${guildId}/textfilter-logs`);
    logs = await r.json();
  }

  async function add() {
    if (!pattern.trim()) return;
    await fetch(`/api/guild/${guildId}/textfilters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: pattern.trim(), action, label: label.trim() }),
    });
    pattern = '';
    label = '';
    load();
  }

  async function remove(id) {
    await fetch(`/api/guild/${guildId}/textfilters/${id}`, { method: 'DELETE' });
    load();
  }

  $: if (guildId) { load(); loadLogs(); }
</script>

<div class="row">
  <span>Add filter:</span>
</div>
<div class="add-row">
  <textarea bind:value={pattern} placeholder="Text to match..." style="min-height:36px;height:36px"></textarea>
  <select bind:value={action}>
    <option value="warn">Warn</option>
    <option value="kick">Kick</option>
    <option value="ban">Ban</option>
  </select>
  <textarea bind:value={label} placeholder="Label (optional)..." style="min-height:36px;height:36px"></textarea>
  <button on:click={add}>Add</button>
</div>

<div class="table-scroll">
  {#if filters.length === 0}
    <p style="color:var(--text-muted)">No text filters.</p>
  {:else}
    <table class="responsive-table">
      <thead><tr><th>Pattern</th><th>Action</th><th>Label</th><th></th></tr></thead>
      <tbody>
        {#each filters as f}
          <tr>
            <td class="mono-cell">{f.pattern}</td>
            <td>{f.action}</td>
            <td>{f.label || ''}</td>
            <td><button class="btn-sm btn-danger" on:click={() => remove(f.id)}>Delete</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<h3 style="margin-top:1rem;font-size:1rem;color:var(--text-muted)">Log</h3>
<div class="row">
  <button on:click={loadLogs}>Refresh</button>
</div>
<div class="table-scroll">
  {#if logs.length === 0}
    <p style="color:var(--text-muted)">No text filter actions logged.</p>
  {:else}
    <table class="responsive-table">
      <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Pattern</th><th>Label</th><th>Channel</th></tr></thead>
      <tbody>
        {#each logs as e}
          <tr>
            <td class="nowrap">{new Date(e.timestamp).toLocaleString()}</td>
            <td class="user-cell">{e.user_name}<br/><span class="id-sub">{e.user_id}</span></td>
            <td>{e.action}</td>
            <td class="mono-cell">{e.pattern}</td>
            <td>{e.label || ''}</td>
            <td>{e.channel_name}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .add-row textarea, .add-row select { margin-top: 0; flex: 1; }
  .table-scroll { margin-top: 1rem; max-height: 50vh; }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .mono-cell { font-family: monospace; font-size: 0.75rem; }
  .nowrap { white-space: nowrap; }
  .user-cell { white-space: nowrap; }
  .id-sub { font-size: 0.6rem; color: var(--text-muted); }
  @media (max-width: 640px) {
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
  }
</style>
