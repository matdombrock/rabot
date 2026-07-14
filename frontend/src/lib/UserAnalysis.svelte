<script>
  import { tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import UserSearchBox from './UserSearchBox.svelte';

  const dispatch = createEventDispatcher();

  export let guildId = '';
  export let analyzeUserId = '';

  let analysis = null;
  let analysisLoading = false;
  let analysisError = '';
  let analysisHistory = [];
  let viewingPastId = null;
  let searchUsers = [];

  // Expose analyzeUser so parent can call it
  export async function analyzeUser(userId) {
    viewingPastId = null;
    analysisLoading = true;
    analysisError = '';
    analysis = null;
    try {
      const r = await fetch(`/api/guild/${guildId}/user-analysis/${userId}`);
      if (!r.ok) throw new Error(await r.text());
      analysis = await r.json();
      loadHistory();
      await tick();
      // Scroll this card into view
      const el = document.querySelector('.analysis-pane');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      analysisError = err.message;
    } finally {
      analysisLoading = false;
    }
  }

  async function loadHistory() {
    if (!guildId) { analysisHistory = []; return; }
    try {
      const r = await fetch(`/api/guild/${guildId}/history`);
      if (!r.ok) return;
      const all = await r.json();
      analysisHistory = all.filter(r => r.type === 'analysis').reverse();
    } catch {}
  }

  function parseAnalysisCsv(csv) {
    const map = {};
    for (const line of csv.split('\n')) {
      const idx = line.indexOf(',');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      map[key] = val;
    }
    return {
      username: map['Username'] || '',
      displayName: map['Display Name'] || '',
      userId: map['User ID'] || '',
      avatarUrl: map['Avatar'] || '',
      discordJoinDate: map['Discord Join Date'] || '',
      guildJoinDate: map['Guild Join Date'] && map['Guild Join Date'] !== 'N/A' ? map['Guild Join Date'] : null,
      daysInServer: map['Days in Server'] || '',
      accountAgeDays: map['Account Age (days)'] || '',
      topRole: map['Top Role'] || '',
      roles: (map['Roles'] || '').split('; ').filter(Boolean),
      isBoosting: map['Boosting'] === 'Yes',
      isBot: map['Bot'] === 'Yes',
      totalMessages: parseInt(map['Total Messages']) || 0,
      lastPostDate: map['Last Post'] && map['Last Post'] !== 'N/A' ? map['Last Post'] : null,
      csv,
      generated: map['Generated'] || '',
    };
  }

  async function viewPast(id) {
    viewingPastId = id;
    analysisLoading = true;
    analysisError = '';
    analysis = null;
    try {
      const r = await fetch(`/api/guild/${guildId}/history/${id}`);
      if (!r.ok) throw new Error(await r.text());
      const record = await r.json();
      analysis = parseAnalysisCsv(record.csv);
    } catch (err) {
      analysisError = err.message;
    } finally {
      analysisLoading = false;
    }
  }

  function closeAnalysis() {
    analysis = null;
    analysisLoading = false;
    analysisError = '';
    viewingPastId = null;
  }

  function downloadAnalysis() {
    if (!analysis) return;
    const blob = new Blob([analysis.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = analysis.generated.replace(/[:.]/g, '-').slice(0, 19);
    a.download = `analysis-${analysis.username}-${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPast(id) {
    const r = await fetch(`/api/guild/${guildId}/history/${id}`);
    const data = await r.json();
    const blob = new Blob([data.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = data.generated.replace(/[:.]/g, '-').slice(0, 19);
    a.download = `analysis-${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deletePast(id) {
    if (!confirm('Delete this analysis?')) return;
    await fetch(`/api/guild/${guildId}/history/${id}`, { method: 'DELETE' });
    if (viewingPastId === id) closeAnalysis();
    loadHistory();
  }

  $: if (guildId) loadHistory();
  $: if (analyzeUserId) analyzeUser(analyzeUserId);

  // Load members for UserSearchBox when guild changes
  $: if (guildId) {
    loadMembers();
  }

  async function loadMembers() {
    try {
      const r = await fetch(`/api/guild/${guildId}/members`);
      if (!r.ok) return;
      const members = await r.json();
      searchUsers = members.map(m => ({
        id: m.id,
        username: m.username,
        displayName: m.display_name || '',
        avatarUrl: m.avatar_url || '',
      }));
    } catch {}
  }
</script>

<div class="analysis-pane">
  <div class="analysis-search">
    <UserSearchBox users={searchUsers} placeholder="Search for a user to analyze..." on:select={(e) => analyzeUser(e.detail.id)} />
  </div>

  {#if !guildId}
    <p style="color:var(--text-muted)">Select a guild to analyze users.</p>
  {:else if analysisLoading}
    <p style="color:var(--text-muted)">Loading...</p>
  {:else if analysisError}
    <p style="color:var(--danger)">Error: {analysisError}</p>
  {:else if analysis}
    <div class="analysis-body">
      {#if analysis.avatarUrl}
        <img src={analysis.avatarUrl} alt="" class="analysis-avatar" />
      {/if}
      <div class="table-scroll" style="flex:1">
        <table class="analysis-table">
          <tbody>
            <tr><td>Username</td><td>{analysis.username}</td></tr>
            <tr><td>Display Name</td><td>{analysis.displayName}</td></tr>
            <tr><td>User ID</td><td>{analysis.userId}</td></tr>
            <tr><td>Discord Join Date</td><td>{analysis.discordJoinDate ? new Date(analysis.discordJoinDate).toLocaleString() : 'N/A'}</td></tr>
            <tr><td>Guild Join Date</td><td>{analysis.guildJoinDate ? new Date(analysis.guildJoinDate).toLocaleString() : 'N/A'}</td></tr>
            <tr><td>Days in Server</td><td>{analysis.daysInServer}</td></tr>
            <tr><td>Account Age</td><td>{analysis.accountAgeDays} days</td></tr>
            <tr><td>Top Role</td><td>{analysis.topRole}</td></tr>
            <tr><td>Roles</td><td>{analysis.roles.join(', ')}</td></tr>
            <tr><td>Boosting</td><td>{analysis.isBoosting ? 'Yes' : 'No'}</td></tr>
            <tr><td>Bot</td><td>{analysis.isBot ? 'Yes' : 'No'}</td></tr>
            <tr><td>Total Messages</td><td>{analysis.totalMessages}</td></tr>
            <tr><td>Last Post</td><td>{analysis.lastPostDate ? new Date(analysis.lastPostDate).toLocaleString() : 'N/A'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="analysis-actions">
      <button class="btn-sm" on:click={downloadAnalysis}>Download CSV</button>
      <button class="btn-sm" on:click={closeAnalysis}>Close</button>
    </div>
  {:else}
    <p style="color:var(--text-muted)">Search for a user above to view their analysis.</p>
  {/if}

  {#if analysisHistory.length > 0}
    <h4 style="margin-top:0.75rem;margin-bottom:0.5rem;font-size:0.85rem;color:var(--text-muted)">Past Analyses</h4>
    <div class="table-scroll">
      <table class="responsive-table">
        <thead>
          <tr>
            <th style="text-align:left;color:var(--text-muted);font-weight:normal">User</th>
            <th style="text-align:left;color:var(--text-muted);font-weight:normal">Generated</th>
            <th style="text-align:left;color:var(--text-muted);font-weight:normal">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each analysisHistory as r}
            <tr>
              <td>{r.username || '—'}</td>
              <td class="nowrap">{new Date(r.generated).toLocaleString()}</td>
              <td class="action-cell">
                <button class="btn-sm" on:click={() => viewPast(r.id)}>View</button>
                <button class="btn-sm" on:click={() => downloadPast(r.id)}>Download</button>
                <button class="btn-sm btn-danger" on:click={() => deletePast(r.id)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .analysis-pane {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .analysis-search .user-search-box { width: 100%; }
  .analysis-search .user-search-box input { width: 100%; }
  .analysis-body {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }
  .analysis-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .analysis-table { width: 100%; font-size: 0.85rem; border-collapse: collapse; }
  .analysis-table td { padding: 0.3rem 0.5rem; border: none; }
  .analysis-table td:first-child { color: var(--text-muted); width: 160px; }
  .analysis-actions {
    display: flex;
    gap: 0.5rem;
  }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); font-weight: normal; }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .nowrap { white-space: nowrap; }
  .action-cell { white-space: nowrap; }
  @media (max-width: 640px) {
    .analysis-body { flex-direction: column; align-items: center; }
    .analysis-avatar { width: 48px; height: 48px; }
    .analysis-table td:first-child { width: 110px; }
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
  }
</style>
