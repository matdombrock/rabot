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
  <textarea bind:value={pattern} placeholder="Text to match..." style="min-height:36px;height:36px;flex:2"></textarea>
  <select bind:value={action} style="flex:1">
    <option value="warn">Warn</option>
    <option value="kick">Kick</option>
    <option value="ban">Ban</option>
  </select>
  <textarea bind:value={label} placeholder="Label (optional)..." style="min-height:36px;height:36px;flex:1"></textarea>
  <button on:click={add}>Add</button>
</div>

<div class="table-wrap">
  {#if filters.length === 0}
    <p style="color:var(--text-muted)">No text filters.</p>
  {:else}
    <table>
      <thead><tr><th>Pattern</th><th>Action</th><th>Label</th><th></th></tr></thead>
      <tbody>
        {#each filters as f}
          <tr>
            <td style="font-family:monospace;font-size:0.8rem">{f.pattern}</td>
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
<div class="table-wrap">
  {#if logs.length === 0}
    <p style="color:var(--text-muted)">No text filter actions logged.</p>
  {:else}
    <table>
      <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Pattern</th><th>Label</th><th>Channel</th></tr></thead>
      <tbody>
        {#each logs as e}
          <tr>
            <td style="white-space:nowrap">{new Date(e.timestamp).toLocaleString()}</td>
            <td>{e.user_name} ({e.user_id})</td>
            <td>{e.action}</td>
            <td style="font-family:monospace;font-size:0.75rem">{e.pattern}</td>
            <td>{e.label || ''}</td>
            <td>{e.channel_name}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .add-row { display: flex; gap: 0.5rem; align-items: stretch; margin-top: 0.5rem; }
  .add-row textarea, .add-row select { margin-top: 0; }
  .status { margin-top: 0.5rem; color: var(--text-muted); font-size: 0.85rem; }
  .table-wrap { margin-top: 1rem; max-height: 50vh; overflow: auto; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  tr:hover td { background: var(--surface-alt); }
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
  .btn-danger { background: var(--danger); border-color: var(--danger); }
  .btn-danger:hover { background: #a03db8; }
</style>
