<script>
  import { onMount } from 'svelte';

  let checksums = [];
  let action = 'ban';
  let newChecksum = '';
  let newLabel = '';

  let logs = [];
  let logStatus = '';

  async function load() {
    const r = await fetch('/api/checksums');
    const data = await r.json();
    checksums = data.checksums;
    action = data.action;
  }

  async function loadLogs() {
    const r = await fetch('/api/modlogs');
    logs = await r.json();
    logStatus = logs.length ? `${logs.length} entries` : '';
  }

  async function saveAction() {
    await fetch('/api/checksums/action', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
  }

  async function addChecksum() {
    if (!newChecksum.trim()) return;
    await fetch('/api/checksums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checksum: newChecksum.trim(), label: newLabel.trim() }),
    });
    newChecksum = '';
    newLabel = '';
    load();
  }

  async function deleteChecksum(c) {
    await fetch(`/api/checksums/${c}`, { method: 'DELETE' });
    load();
  }

  async function clearLogs() {
    if (!confirm('Clear all mod log entries?')) return;
    await fetch('/api/modlogs', { method: 'DELETE' });
    loadLogs();
  }

  onMount(() => {
    load();
    loadLogs();
  });
</script>

<div class="row">
  <span>Action:</span>
  <select bind:value={action}>
    <option value="ban">Ban</option>
    <option value="kick">Kick</option>
  </select>
  <button on:click={saveAction}>Save</button>
</div>

<div class="add-row">
  <textarea bind:value={newChecksum} placeholder="SHA256 checksum..." style="min-height:36px;height:36px;flex:2"></textarea>
  <textarea bind:value={newLabel} placeholder="Label (optional)..." style="min-height:36px;height:36px;flex:1"></textarea>
  <button on:click={addChecksum}>Add</button>
</div>

<div class="table-wrap">
  {#if checksums.length === 0}
    <p style="color:var(--text-muted)">No checksums.</p>
  {:else}
    <table>
      <thead><tr><th>SHA256</th><th>Label</th><th></th></tr></thead>
      <tbody>
        {#each checksums as e}
          <tr>
            <td style="font-family:monospace;font-size:0.75rem">{e.checksum}</td>
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
<div class="table-wrap">
  {#if logs.length === 0}
    <p style="color:var(--text-muted)">No moderation actions logged.</p>
  {:else}
    <table>
      <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Checksum</th><th>Label</th><th>Channel</th><th>Guild</th><th>Deleted</th></tr></thead>
      <tbody>
        {#each logs as e}
          <tr>
            <td style="white-space:nowrap">{new Date(e.timestamp).toLocaleString()}</td>
            <td>{e.userName} ({e.userId})</td>
            <td>{e.action}</td>
            <td style="font-family:monospace;font-size:0.75rem">{e.checksum.slice(0, 16)}...</td>
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
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .add-row { display: flex; gap: 0.5rem; align-items: stretch; margin-top: 0.5rem; }
  .add-row textarea { margin-top: 0; }
  .status { margin-top: 0.5rem; color: var(--text-muted); font-size: 0.85rem; }
  .table-wrap { margin-top: 1rem; max-height: 70vh; overflow: auto; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  tr:hover td { background: var(--surface-alt); }
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
  .btn-danger { background: var(--danger); border-color: var(--danger); }
  .btn-danger:hover { background: #a03db8; }
</style>
