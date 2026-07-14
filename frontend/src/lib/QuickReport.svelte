<script>
  import { tick } from 'svelte';

  export let guildId = '';
  export let analyzeUserId = '';

  let loading = false;
  let status = '';
  let csv = '';
  let guildName = '';
  let searchTerm = '';
  let nameInput = '';
  let nameFilter = '';
  let showNameDropdown = false;
  let roleInput = '';
  let roleFilter = '';
  let showRoleDropdown = false;
  let sortCol = -1;
  let sortAsc = true;
  let headers = [];
  let rows = [];
  let rawData = [];
  let roles = [];
  let users = [];

  let analysis = null;
  let analysisLoading = false;
  let analysisError = '';
  let analysisHistory = [];
  let viewingPastId = null;

  async function loadHistory() {
    if (!guildId) { analysisHistory = []; return; }
    try {
      const r = await fetch(`/api/guild/${guildId}/history`);
      if (!r.ok) return;
      const all = await r.json();
      analysisHistory = all.filter(r => r.type === 'analysis').reverse();
    } catch {}
  }

  async function viewPast(id) {
    viewingPastId = id;
    analysisLoading = true;
    analysisError = '';
    analysis = null;
    try {
      const r = await fetch(`/api/guild/${guildId}/history/${id}`);
      if (!r.ok) throw new Error(await r.text());
      analysis = await r.json();
    } catch (err) {
      analysisError = err.message;
    } finally {
      analysisLoading = false;
    }
  }

  function fuzzyMatch(term, text) {
    if (!term) return true;
    const t = term.toLowerCase();
    const txt = text.toLowerCase();
    let ti = 0;
    for (let i = 0; i < t.length; i++) {
      const found = txt.indexOf(t[i], ti);
      if (found === -1) return false;
      ti = found + 1;
    }
    return true;
  }

  function parseRow(line) {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  }

  function isNumeric(v) { return /^\d+(\.\d+)?$/.test(v); }

  function applySort(data, col, asc) {
    return [...data].sort((a, b) => {
      const av = a[col] ?? "", bv = b[col] ?? "";
      if (isNumeric(av) && isNumeric(bv)) return asc ? +av - +bv : +bv - +av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }

  function setSort(col) {
    if (col === sortCol) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = true; }
    rows = applySort(filteredData(), sortCol, sortAsc);
  }

  function filteredData() {
    let data = rawData;
    if (nameFilter) data = data.filter(r => r[2] === nameFilter || r[3] === nameFilter);
    if (searchTerm) data = data.filter(r => r.some(c => fuzzyMatch(searchTerm, c)));
    if (roleFilter) data = data.filter(r => r[4] === roleFilter);
    return data;
  }

  function render() {
    headers = rawData.length ? parseRow(csv.split('\n').filter(l => l.trim())[0]) : [];
    rows = applySort(filteredData(), sortCol, sortAsc);
  }

  async function run() {
    if (!guildId) return;
    loading = true;
    status = 'Generating...';
    csv = '';
    analysis = null;
    nameFilter = '';
    nameInput = '';
    roleFilter = '';
    roleInput = '';
    try {
      const r = await fetch(`/api/guild/${guildId}/reports/quick-report`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      status = `${data.guildName} — ${data.totalMembers} members — ${data.generated}`;
      csv = data.csv;
      guildName = data.guildName;
      const lines = csv.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        rawData = lines.slice(1).map(l => parseRow(l));
        roles = [...new Set(rawData.map(r => r[4]).filter(Boolean))].sort();
        users = [...new Map(rawData.map(r => [r[2], { username: r[2], displayName: r[3], avatarUrl: r[1] }])).values()].sort((a, b) => a.username.localeCompare(b.username));
        render();
      }
    } catch (err) {
      status = 'Error: ' + err.message;
    } finally {
      loading = false;
    }
  }

  function downloadCsv() {
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `user-list-${guildName || 'guild'}-${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function analyzeUser(userId) {
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
      document.querySelector('.analysis-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  async function downloadPast(id, guildName, type) {
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

  $: if (csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length > 1) {
      rawData = lines.slice(1).map(l => parseRow(l));
      roles = [...new Set(rawData.map(r => r[4]).filter(Boolean))].sort();
      users = [...new Map(rawData.map(r => [r[2], { username: r[2], displayName: r[3], avatarUrl: r[1] }])).values()].sort((a, b) => a.username.localeCompare(b.username));
      render();
    }
  }
  $: if (guildId && csv.length === 0) run();
  $: if (guildId) loadHistory();
  $: if (analyzeUserId) analyzeUser(analyzeUserId);
</script>

<div class="analysis-card">
  <div class="analysis-header">
    <h3 style="margin:0;font-size:1rem;color:var(--text)">
      User Analysis
      {#if analysisLoading}— loading...{/if}
    </h3>
    <div class="row">
      {#if analysis && !analysisLoading}
        <button class="btn-sm" on:click={downloadAnalysis}>Download</button>
      {/if}
      {#if analysis || viewingPastId}
        <button class="btn-sm" on:click={closeAnalysis}>Close</button>
      {/if}
    </div>
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
      <table class="analysis-table">
        <tbody>
          <tr><td>Username</td><td>{analysis.username}</td></tr>
          <tr><td>Display Name</td><td>{analysis.displayName}</td></tr>
          <tr><td>User ID</td><td>{analysis.userId}</td></tr>
          <tr><td>Discord Join Date</td><td>{new Date(analysis.discordJoinDate).toLocaleString()}</td></tr>
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
  {:else}
    <p style="color:var(--text-muted)">Click <strong>Analyze</strong> on a user above, or select a past analysis below.</p>
  {/if}

  {#if analysisHistory.length > 0}
    <h4 style="margin-top:0.75rem;margin-bottom:0.5rem;font-size:0.85rem;color:var(--text-muted)">Past Analyses</h4>
    <table class="analysis-table">
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
            <td>{new Date(r.generated).toLocaleString()}</td>
            <td>
              <button class="btn-sm" on:click={() => viewPast(r.id)}>View</button>
              <button class="btn-sm" on:click={() => downloadPast(r.id)}>Download</button>
              <button class="btn-sm btn-danger" on:click={() => deletePast(r.id)}>Delete</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<div class="row">
  <button on:click={run} disabled={loading || !guildId}>Run</button>
  <button on:click={downloadCsv} disabled={!csv}>Download CSV</button>
</div>

<div class="row" style="margin-top:0.5rem">
  <input type="text" placeholder="Search..." bind:value={searchTerm} on:input={render} style="flex:1;max-width:200px" />
  <div class="name-autocomplete">
    <input type="text" placeholder="Filter by name..." bind:value={nameInput} on:focus={() => showNameDropdown = true} on:blur={() => setTimeout(() => showNameDropdown = false, 300)} on:input={() => showNameDropdown = true} style="width:150px;min-height:unset;padding:0.5rem;font-size:0.9rem" />
    {#if showNameDropdown}
      <div class="name-dropdown">
        {#each users.filter(u => !nameInput || u.username.toLowerCase().includes(nameInput.toLowerCase()) || u.displayName.toLowerCase().includes(nameInput.toLowerCase())).slice(0, 10) as u}
          <button class="name-option" on:click={() => { nameFilter = u.username; nameInput = u.username; showNameDropdown = false; render(); }}>
            {#if u.avatarUrl.startsWith('https://cdn.discordapp.com/')}<img src={u.avatarUrl} alt="" class="name-opt-avatar" />{/if}
            <span>{u.username}</span>
            {#if u.displayName && u.displayName !== u.username}
              <span style="color:var(--text-muted)">({u.displayName})</span>
            {/if}
          </button>
        {/each}
        {#if nameInput && !users.some(u => u.username.toLowerCase() === nameInput.toLowerCase())}
          <button class="name-option" on:click={() => { nameFilter = ''; nameInput = ''; showNameDropdown = false; render(); }}>Clear filter</button>
        {/if}
      </div>
    {/if}
  </div>
  {#if nameFilter}
    <span class="name-badge" on:click={() => { nameFilter = ''; nameInput = ''; render(); }}>× {nameFilter}</span>
  {/if}
  <div class="role-autocomplete">
    <input type="text" placeholder="Filter by role..." bind:value={roleInput} on:focus={() => showRoleDropdown = true} on:blur={() => setTimeout(() => showRoleDropdown = false, 200)} on:input={() => showRoleDropdown = true} style="width:130px;min-height:unset;padding:0.5rem;font-size:0.9rem" />
    {#if showRoleDropdown}
      <div class="role-dropdown">
        {#each roles.filter(r => !roleInput || r.toLowerCase().includes(roleInput.toLowerCase())).slice(0, 10) as r}
          <button class="role-option" on:click={() => { roleFilter = r; roleInput = r; showRoleDropdown = false; render(); }}>
            {r}
          </button>
        {/each}
        {#if roleInput && !roles.some(r => r.toLowerCase() === roleInput.toLowerCase())}
          <button class="role-option" on:click={() => { roleFilter = ''; roleInput = ''; showRoleDropdown = false; render(); }}>
            Clear filter
          </button>
        {/if}
      </div>
    {/if}
  </div>
  {#if roleFilter}
    <span class="role-badge" on:click={() => { roleFilter = ''; roleInput = ''; render(); }}>× {roleFilter}</span>
  {/if}
</div>

<div class="status">{status}</div>

<div class="table-wrap">
  {#if headers.length > 0}
    <table>
      <thead>
        <tr>
          {#each headers as h, i}
            <th class:sort-asc={i === sortCol && sortAsc} class:sort-desc={i === sortCol && !sortAsc} on:click={() => setSort(i)}>{h}</th>
          {/each}
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, ri}
          <tr>
            {#each row as cell}
              <td>{#if cell.startsWith('https://cdn.discordapp.com/')}<img src={cell} alt="" class="avatar" />{:else}{cell}{/if}</td>
            {/each}
            <td><button class="btn-sm" on:click={() => analyzeUser(row[0])} disabled={analysisLoading}>Analyze</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if csv}
    <p style="color:var(--text-muted)">No data.</p>
  {/if}
</div>

<style>
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .status { margin-top: 0.5rem; color: var(--text-muted); font-size: 0.85rem; }
  .table-wrap { margin-top: 1rem; max-height: 70vh; overflow: auto; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; cursor: pointer; user-select: none; color: var(--text); }
  th:hover { filter: brightness(1.2); }
  th::after { content: " \25B2"; font-size: 0.6rem; opacity: 0.4; }
  th.sort-asc::after { content: " \25B2"; opacity: 1; }
  th.sort-desc::after { content: " \25BC"; opacity: 1; }
  td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  tr:hover td { background: var(--surface-alt); }
  .avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; vertical-align: middle; }
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
  .btn-danger { background: var(--danger); border-color: var(--danger); }
  .btn-danger:hover { background: #a03db8; }
  .role-autocomplete { position: relative; display: inline-block; }
  .name-autocomplete { position: relative; display: inline-block; }
  .name-dropdown, .role-dropdown {
    position: absolute; top: 100%; left: 0; z-index: 10;
    background: var(--surface); border: 1px solid var(--surface-alt); border-radius: 4px;
    max-height: 200px; overflow-y: auto; min-width: 180px;
  }
  .role-option {
    display: flex; align-items: center; width: 100%;
    padding: 0.35rem 0.5rem; font-size: 0.8rem; border: none; border-radius: 0;
    background: none; color: var(--text); cursor: pointer; text-align: left;
  }
  .name-option:hover, .role-option:hover { background: var(--surface-alt); }
  .name-opt-avatar { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }
  .name-badge, .role-badge {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;
    background: var(--primary); color: var(--text-bright); cursor: pointer;
  }
  .analysis-card {
    background: var(--surface);
    border: 1px solid var(--surface-alt);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .analysis-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .analysis-body {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }
  .analysis-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
  .analysis-table { width: 100%; font-size: 0.85rem; border-collapse: collapse; }
  .analysis-table td { padding: 0.3rem 0.5rem; border: none; }
  .analysis-table td:first-child { color: var(--text-muted); width: 160px; }
  .analysis-table th { padding: 0.3rem 0.5rem; border: none; background: none; cursor: default; }
  .analysis-table th::after { content: none; }
</style>
