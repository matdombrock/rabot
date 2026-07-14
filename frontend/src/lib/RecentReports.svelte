<script>
  export let guildId = '';

  let reports = [];
  let status = '';

  async function load() {
    if (!guildId) return;
    try {
      const r = await fetch(`/api/guild/${guildId}/history`);
      reports = await r.json();
      status = reports.length ? `${reports.length} report(s) saved` : '';
    } catch (err) {
      status = 'Error: ' + err.message;
    }
  }

  async function download(id, guildName, type) {
    const r = await fetch(`/api/guild/${guildId}/history/${id}`);
    const data = await r.json();
    const blob = new Blob([data.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = data.generated.replace(/[:.]/g, '-').slice(0, 19);
    a.download = `${type}-${guildName}-${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function del(id) {
    if (!confirm('Delete this report?')) return;
    await fetch(`/api/guild/${guildId}/history/${id}`, { method: 'DELETE' });
    load();
  }

  $: if (guildId) load();
</script>

<div class="row">
  <button on:click={load}>Refresh</button>
</div>
<div class="status">{status}</div>
<div class="table-wrap">
  {#if reports.length === 0}
    <p style="color:var(--text-muted)">No saved reports.</p>
  {:else}
    <table>
      <thead><tr><th>Type</th><th>Generated</th><th>Actions</th></tr></thead>
      <tbody>
        {#each reports as r}
          <tr>
            <td>{r.type}</td>
            <td>{new Date(r.generated).toLocaleString()}</td>
            <td>
              <button class="btn-sm" on:click={() => download(r.id, r.guildName, r.type)}>Download</button>
              <button class="btn-sm btn-danger" on:click={() => del(r.id)}>Delete</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
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
