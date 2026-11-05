<script>
  export let guildId = '';

  let logs = [];
  let loading = false;

  async function load() {
    if (!guildId) { logs = []; return; }
    loading = true;
    try {
      const r = await fetch(`/api/guild/${guildId}/logs/action`);
      if (!r.ok) throw new Error(await r.text());
      logs = await r.json();
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function clear() {
    if (!confirm('Clear all action log entries?')) return;
    try {
      await fetch(`/api/guild/${guildId}/logs/action`, { method: 'DELETE' });
      logs = [];
    } catch (err) {
      console.error(err);
    }
  }

  function tagClass(action) {
    // Moderation/punishment actions
    if (action.startsWith('member-ban') || action.startsWith('member-kick') || action === 'message-delete' || action === 'audit-message-delete') return 'tag-danger';
    // Creation actions
    if (action.includes('-create') || action.includes('-add')) return 'tag-success';
    // Deletion actions
    if (action.includes('-delete') || action.includes('-remove')) return 'tag-danger';
    // Update actions
    if (action.includes('-update') || action.includes('member-role')) return 'tag-warn';
    // Auto-mod actions
    if (action.startsWith('automod-')) return 'tag-auto';
    // Audit actions (general)
    if (action.startsWith('audit-') || action.startsWith('message-')) return 'tag-info';
    return 'tag-default';
  }

  function displayAction(action) {
    return action.replace(/-/g, ' ');
  }

  $: if (guildId) load();
</script>

<div class="row">
  <button on:click={load} disabled={loading}>Refresh</button>
  <button class="btn-sm btn-danger" on:click={clear}>Clear All</button>
</div>

<div class="status">{logs.length > 0 ? `${logs.length} entry(ies)` : ''}</div>

<div class="table-scroll">
  {#if logs.length === 0}
    <p style="color:var(--text-muted)">No actions logged.</p>
  {:else}
    <table class="responsive-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Action</th>
          <th>Target</th>
          <th>Channel</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {#each logs as e}
          <tr>
            <td class="nowrap">{new Date(e.timestamp).toLocaleString()}</td>
            <td><span class="action-tag {tagClass(e.action)}">{displayAction(e.action)}</span></td>
            <td class="nowrap">{e.target_name}<br/><span class="id-sub">{e.target_id}</span></td>
            <td>{e.channel_name}</td>
            <td class="details-cell">{e.details}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .table-scroll { margin-top: 0.5rem; max-height: 50vh; }
  @media (max-width: 640px) {
    .table-scroll { max-height: 35vh; }
  }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .nowrap { white-space: nowrap; }
  .id-sub { font-size: 0.6rem; color: var(--text-muted); }
  .action-tag {
    display: inline-block;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .tag-danger { background: var(--danger); color: var(--text-bright); }
  .tag-success { background: #2a6b3c; color: var(--text-bright); }
  .tag-warn { background: #8c7a20; color: var(--text-bright); }
  .tag-auto { background: #5b2b8c; color: var(--text-bright); }
  .tag-info { background: var(--surface-alt); color: var(--text); }
  .tag-default { background: var(--surface-alt); color: var(--text); }
  .details-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 640px) {
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
    .details-cell { max-width: 120px; }
  }
</style>
