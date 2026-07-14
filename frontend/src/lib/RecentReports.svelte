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
<div class="table-scroll">
  {#if reports.length === 0}
    <p style="color:var(--text-muted)">No saved reports.</p>
  {:else}
    <table class="responsive-table">
      <thead><tr><th>Type</th><th>Generated</th><th>Actions</th></tr></thead>
      <tbody>
        {#each reports as r}
          <tr>
            <td>{r.type}</td>
            <td class="nowrap">{new Date(r.generated).toLocaleString()}</td>
            <td class="action-cell">
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
  .table-scroll { margin-top: 1rem; max-height: 60vh; }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .nowrap { white-space: nowrap; }
  .action-cell { white-space: nowrap; }
  @media (max-width: 640px) {
    .table-scroll { max-height: 40vh; }
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
  }
</style>
