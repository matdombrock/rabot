<script>
  export let guildId = '';

  let loading = false;
  let status = '';
  let csv = '';
  let guildName = '';
  let searchTerm = '';
  let sortCol = -1;
  let sortAsc = true;
  let headers = [];
  let rows = [];
  let rawData = [];

  let analysis = null;
  let analysisLoading = false;
  let analysisError = '';

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
    if (!searchTerm) return rawData;
    return rawData.filter(r => r.some(c => fuzzyMatch(searchTerm, c)));
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
    analysisLoading = true;
    analysisError = '';
    analysis = null;
    try {
      const r = await fetch(`/api/guild/${guildId}/user-analysis/${userId}`);
      if (!r.ok) throw new Error(await r.text());
      analysis = await r.json();
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

  $: if (csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length > 1) {
      rawData = lines.slice(1).map(l => parseRow(l));
      render();
    }
  }
  $: if (guildId && csv.length === 0) run();
</script>

{#if analysis || analysisLoading}
  <div class="analysis-card">
    <div class="analysis-header">
      <h3 style="margin:0;font-size:1rem;color:var(--text)">User Analysis {#if analysisLoading}— loading...{/if}</h3>
      <div class="row">
        {#if analysis && !analysisLoading}
          <button class="btn-sm" on:click={downloadAnalysis}>Download</button>
        {/if}
        <button class="btn-sm" on:click={closeAnalysis}>Close</button>
      </div>
    </div>
    {#if analysisLoading}
      <p style="color:var(--text-muted);margin-top:0.5rem">Scanning channels for messages...</p>
    {:else if analysisError}
      <p style="color:var(--danger);margin-top:0.5rem">Error: {analysisError}</p>
    {:else}
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
    {/if}
  </div>
{/if}

<div class="row">
  <button on:click={run} disabled={loading || !guildId}>Run</button>
  <button on:click={downloadCsv} disabled={!csv}>Download CSV</button>
</div>

<div class="row" style="margin-top:0.5rem">
  <input type="text" placeholder="Search..." bind:value={searchTerm} on:input={render} style="flex:1" />
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
  .analysis-avatar {
    width: 64px; height: 64px; border-radius: 50%; object-fit: cover;
  }
  .analysis-table { width: 100%; font-size: 0.85rem; border-collapse: collapse; }
  .analysis-table td { padding: 0.3rem 0.5rem; border: none; }
  .analysis-table td:first-child { color: var(--text-muted); width: 160px; }
</style>
