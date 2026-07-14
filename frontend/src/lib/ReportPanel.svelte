<script>
  export let guildId = '';
  export let endpoint = '';
  export let showSearch = false;
  export let autoRun = false;

  let loading = false;
  let status = '';
  let csv = '';
  let guildName = '';
  let searchTerm = '';
  let sortCol = -1;
  let sortAsc = true;
  let headers = [];
  let rows = [];

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
    const all = csv ? csv.split('\n').filter(l => l.trim()) : [];
    if (!all.length) return [];
    const parsed = all.slice(1).map(l => parseRow(l));
    if (!searchTerm) return parsed;
    return parsed.filter(r => r.some(c => fuzzyMatch(searchTerm, c)));
  }

  function render() {
    const all = csv ? csv.split('\n').filter(l => l.trim()) : [];
    if (!all.length) { headers = []; rows = []; return; }
    headers = parseRow(all[0]);
    rows = applySort(filteredData(), sortCol, sortAsc);
  }

  function copyRow(row) {
    const [avatar, username, displayName, topRole, days] = row;
    const text = `${username} (${displayName}) — ${topRole} — ${days} days`;
    navigator.clipboard.writeText(text);
    status = `Copied: ${text}`;
    setTimeout(() => { status = `${guildName} — ${filteredData().length} members`; }, 2000);
  }

  async function run() {
    if (!guildId) return;
    loading = true;
    status = 'Generating report...';
    csv = '';
    try {
      const r = await fetch(`/api/guild/${guildId}/reports/${endpoint}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      guildName = data.guildName;
      status = `${data.guildName} — ${data.totalMembers} members — ${data.generated}`;
      csv = data.csv;
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
    a.download = `${endpoint}-${guildName || 'guild'}-${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  $: if (csv) render();
  $: if (guildId && autoRun) run();
</script>

<div class="row">
  <button on:click={run} disabled={loading || !guildId}>Run</button>
  <button on:click={downloadCsv} disabled={!csv}>Export CSV</button>
</div>

{#if showSearch}
  <div class="row" style="margin-top:0.5rem">
    <input type="text" placeholder="Search..." bind:value={searchTerm} on:input={render} style="flex:1" />
  </div>
{/if}

<div class="status">{status}</div>

<div class="table-scroll">
  {#if headers.length > 0}
    <table class="responsive-table">
      <thead>
        <tr>
          {#each headers as h, i}
            <th class:sort-asc={i === sortCol && sortAsc} class:sort-desc={i === sortCol && !sortAsc} on:click={() => setSort(i)}>
              {h}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row}
          <tr class="clickable" on:click={() => copyRow(row)}>
            {#each row as cell}
              <td>{#if cell.startsWith('https://cdn.discordapp.com/')}<img src={cell} alt="" class="avatar" />{:else}{cell}{/if}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if csv}
    <p style="color:var(--text-muted)">No data.</p>
  {/if}
</div>

<style>
  .table-scroll { margin-top: 1rem; max-height: 70vh; }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; cursor: pointer; user-select: none; color: var(--text); }
  .responsive-table th:hover { filter: brightness(1.2); }
  .responsive-table th::after { content: " \25B2"; font-size: 0.6rem; opacity: 0.4; }
  .responsive-table th.sort-asc::after { content: " \25B2"; opacity: 1; }
  .responsive-table th.sort-desc::after { content: " \25BC"; opacity: 1; }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .responsive-table tr.clickable { cursor: pointer; }
  .avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; vertical-align: middle; }
  @media (max-width: 640px) {
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
  }
</style>
