<script>
  export let guildId = '';

  let checksums = [];
  let action = 'ban';
  let newChecksum = '';
  let newLabel = '';
  let logs = [];
  let logStatus = '';

  async function load() {
    if (!guildId) return;
    const r = await fetch(`/api/guild/${guildId}/checksums`);
    const data = await r.json();
    checksums = data.checksums;
    action = data.action;
  }

  async function loadLogs() {
    if (!guildId) return;
    const r = await fetch(`/api/guild/${guildId}/modlogs`);
    logs = await r.json();
    logStatus = logs.length ? `${logs.length} entries` : '';
  }

  async function saveAction() {
    await fetch(`/api/guild/${guildId}/checksums/action`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
  }

  async function addChecksum() {
    if (!newChecksum.trim()) return;
    await fetch(`/api/guild/${guildId}/checksums`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checksum: newChecksum.trim(), label: newLabel.trim() }),
    });
    newChecksum = '';
    newLabel = '';
    load();
  }

  async function deleteChecksum(c) {
    await fetch(`/api/guild/${guildId}/checksums/${c}`, { method: 'DELETE' });
    load();
  }

  async function clearLogs() {
    if (!confirm('Clear all mod log entries?')) return;
    await fetch(`/api/guild/${guildId}/modlogs`, { method: 'DELETE' });
    loadLogs();
  }

  $: if (guildId) { load(); loadLogs(); }
</script>

<div class="row">
  <span>Action:</span>
  <select bind:value={action} class="action-select">
    <option value="ban">Ban</option>
    <option value="kick">Kick</option>
  </select>
  <button on:click={saveAction}>Save</button>
</div>

<div class="add-row">
  <textarea bind:value={newChecksum} placeholder="SHA256 checksum..." style="min-height:36px;height:36px"></textarea>
  <textarea bind:value={newLabel} placeholder="Label (optional)..." style="min-height:36px;height:36px"></textarea>
  <button on:click={addChecksum}>Add</button>
</div>

<div class="table-scroll">
  {#if checksums.length === 0}
    <p style="color:var(--text-muted)">No checksums.</p>
  {:else}
    <table class="responsive-table">
      <thead><tr><th>SHA256</th><th>Label</th><th></th></tr></thead>
      <tbody>
        {#each checksums as e}
          <tr>
            <td class="mono-cell">{e.checksum}</td>
            <td>{e.label || ''}</td>
            <td><button class="btn-sm btn-danger" on:click={() => deleteChecksum(e.checksum)}>Delete</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<h3 style="margin-top:1rem;font-size:1rem;color:var(--text-muted)">Log</h3>
<div class="row">
  <button on:click={loadLogs}>Refresh</button>
  <button class="btn-sm btn-danger" on:click={clearLogs}>Clear All</button>
</div>
<div class="status">{logStatus}</div>
<div class="table-scroll">
  {#if logs.length === 0}
    <p style="color:var(--text-muted)">No moderation actions logged.</p>
  {:else}
    <table class="responsive-table">
      <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Checksum</th><th>Label</th><th>Channel</th><th>Guild</th><th>Deleted</th></tr></thead>
      <tbody>
        {#each logs as e}
          <tr>
            <td class="nowrap">{new Date(e.timestamp).toLocaleString()}</td>
            <td class="user-cell">{e.userName}<br/><span class="id-sub">{e.userId}</span></td>
            <td>{e.action}</td>
            <td class="mono-cell">{e.checksum.slice(0, 16)}...</td>
            <td>{e.label || ''}</td>
            <td>{e.channelName}</td>
            <td>{e.guildName}</td>
            <td>{e.messagesDeleted}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .action-select { max-width: 100px; }
  .add-row textarea { margin-top: 0; flex: 1; }
  .table-scroll { margin-top: 1rem; max-height: 70vh; }
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
