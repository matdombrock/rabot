<script>
  import { createEventDispatcher } from 'svelte';
  import UserSearchBox from './UserSearchBox.svelte';
  import AvatarPopup from './AvatarPopup.svelte';
  import { tick } from 'svelte';

  let avatarPopup = { show: false, url: '', name: '' };

  function showAvatar(url, name) {
    avatarPopup = { show: true, url, name: name || '' };
  }

  const dispatch = createEventDispatcher();

  export let guildId = '';

  let loading = false;
  let status = '';
  let csv = '';
  let guildName = '';
  let totalMembers = 0;
  let onlineCount = 0;
  let nameFilter = '';
  let roleInput = '';
  let roleFilter = '';
  let showRoleDropdown = false;
  let watchFilter = false;
  let memberWatch = {};
  let sortCol = -1;
  let sortAsc = true;
  let headers = [];
  let rows = [];
  let rawData = [];
  let roles = [];
  let users = [];
  let searchUsers = [];

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

  function onNameSelect(user) {
    nameFilter = user.id;
    render();
  }

  function onNameClear() {
    nameFilter = '';
    render();
  }

  function filteredData() {
    let data = rawData;
    if (nameFilter) data = data.filter(r => r[0] === nameFilter);
    if (roleFilter) data = data.filter(r => r[4] === roleFilter);
    if (watchFilter) data = data.filter(r => memberWatch[r[0]]);
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
    nameFilter = '';
    roleFilter = '';
    roleInput = '';
    try {
      const r = await fetch(`/api/guild/${guildId}/reports/quick-report`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      status = `${data.generated}`;
      csv = data.csv;
      guildName = data.guildName;
      totalMembers = data.totalMembers;
      onlineCount = data.onlineCount;
      // Load watch states
      const membersR = await fetch(`/api/guild/${guildId}/members`);
      if (membersR.ok) {
        const memberList = await membersR.json();
        memberWatch = {};
        for (const m of memberList) {
          memberWatch[m.id] = !!m.watched;
        }
      }
      const lines = csv.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        rawData = lines.slice(1).map(l => parseRow(l));
        roles = [...new Set(rawData.map(r => r[4]).filter(Boolean))].sort();
        users = [...new Map(rawData.map(r => [r[2], { username: r[2], displayName: r[3], avatarUrl: r[1] }])).values()].sort((a, b) => a.username.localeCompare(b.username));
        // Build search users — map lookup from username to user ID (row[0])
        const userNameToId = new Map(rawData.map(r => [r[2], r[0]]));
        searchUsers = users.map(u => ({
          id: userNameToId.get(u.username) ?? u.username,
          username: u.username,
          displayName: u.displayName || '',
          avatarUrl: (u.avatarUrl && u.avatarUrl.startsWith('https://cdn.discordapp.com/')) ? u.avatarUrl : '',
        }));
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

  async function toggleWatch(userId) {
    try {
      const r = await fetch(`/api/guild/${guildId}/members/${userId}/watch`, { method: 'PUT' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      memberWatch = { ...memberWatch, [userId]: data.watched };
    } catch (err) {
      console.error('Toggle watch failed:', err);
    }
  }

  function analyzeUser(userId) {
    dispatch('analyzeUser', userId);
  }

  function viewMessages(userId) {
    dispatch('viewMessages', userId);
  }

  $: if (csv) {
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length > 1) {
      rawData = lines.slice(1).map(l => parseRow(l));
      roles = [...new Set(rawData.map(r => r[4]).filter(Boolean))].sort();
      users = [...new Map(rawData.map(r => [r[2], { username: r[2], displayName: r[3], avatarUrl: r[1] }])).values()].sort((a, b) => a.username.localeCompare(b.username));
      const userNameToId = new Map(rawData.map(r => [r[2], r[0]]));
      searchUsers = users.map(u => ({
        id: userNameToId.get(u.username) ?? u.username,
        username: u.username,
        displayName: u.displayName || '',
        avatarUrl: (u.avatarUrl && u.avatarUrl.startsWith('https://cdn.discordapp.com/')) ? u.avatarUrl : '',
      }));
      render();
    }
  }
  $: if (guildId && csv.length === 0) run();
</script>

<div class="row">
  <button on:click={run} disabled={loading || !guildId}>Update</button>
  <button on:click={downloadCsv} disabled={!csv}>Export CSV</button>
  <button on:click={() => { watchFilter = !watchFilter; render(); }} class:active={watchFilter}>Watch List</button>
</div>

<div class="row" style="margin-top:0.5rem">
  <UserSearchBox users={searchUsers} bind:value={nameFilter} placeholder="Filter by name..." on:select={(e) => onNameSelect(e.detail)} on:clear={onNameClear} />
  {#if nameFilter}
    <span class="name-badge" on:click={onNameClear}>× {(searchUsers.find(u => u.id === nameFilter)?.username) || nameFilter}</span>
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

{#if guildName}
  <div class="guild-stats-bar">
    <span class="guild-stat"><i class="fa-solid fa-user"></i> {totalMembers.toLocaleString()} members</span>
    <span class="guild-stat online"><i class="fa-solid fa-circle"></i> {onlineCount.toLocaleString()} online</span>
    <span class="guild-stat-date">{status}</span>
  </div>
{/if}

<div class="table-scroll">
  {#if headers.length > 0}
    <table class="responsive-table">
      <thead>
        <tr>
          {#each headers as h, i}
            {#if h !== 'ID'}
              <th class:sort-asc={i === sortCol && sortAsc} class:sort-desc={i === sortCol && !sortAsc} on:click={() => setSort(i)}>{h}</th>
            {/if}
          {/each}
          <th>ID</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, ri}
          <tr>
            {#each row as cell, ci}
              {#if ci !== 0}
                <td>{#if cell.startsWith('https://cdn.discordapp.com/')}<img src={cell} alt="" class="avatar clickable" on:click={() => showAvatar(cell, row[2])} />{:else}{cell}{/if}</td>
              {/if}
            {/each}
            <td style="font-family:monospace;font-size:0.75rem">{row[0]}</td>
            <td class="action-cell">
              <button class="btn-sm" class:btn-watched={memberWatch[row[0]]} on:click={() => toggleWatch(row[0])}>Watch</button>
              <button class="btn-sm" on:click={() => analyzeUser(row[0])}>Scan</button>
              <button class="btn-sm" on:click={() => viewMessages(row[0])}>Messages</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if csv}
    <p style="color:var(--text-muted)">No data.</p>
  {/if}
</div>

<AvatarPopup show={avatarPopup.show} url={avatarPopup.url} name={avatarPopup.name} />

<style>
  .guild-stats-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.5rem 0;
    flex-wrap: wrap;
  }
  .guild-stat {
    font-size: 0.85rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .guild-stat i {
    font-size: 0.65rem;
  }
  .guild-stat.online i {
    color: #23a55a;
  }
  .guild-stat-date {
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.6;
    margin-left: auto;
  }
  .table-scroll { margin-top: 1rem; max-height: 60vh; }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; cursor: pointer; user-select: none; color: var(--text); }
  .responsive-table th:hover { filter: brightness(1.2); }
  .responsive-table th::after { content: " \25B2"; font-size: 0.6rem; opacity: 0.4; }
  .responsive-table th.sort-asc::after { content: " \25B2"; opacity: 1; }
  .responsive-table th.sort-desc::after { content: " \25BC"; opacity: 1; }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; vertical-align: middle; }
  .role-autocomplete { position: relative; display: inline-block; }
  .role-dropdown {
    position: absolute; top: 100%; left: 0; z-index: 10;
    background: var(--surface); border: 1px solid var(--surface-alt); border-radius: 4px;
    max-height: 200px; overflow-y: auto; min-width: 180px;
  }
  .role-option {
    display: flex; align-items: center; width: 100%;
    padding: 0.35rem 0.5rem; font-size: 0.8rem; border: none; border-radius: 0;
    background: none; color: var(--text); cursor: pointer; text-align: left;
  }
  .role-option:hover { background: var(--surface-alt); }
  .btn-watched { background: var(--primary); border-color: var(--primary); }
  button.active { background: var(--primary); }
  .name-badge, .role-badge {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;
    background: var(--primary); color: var(--text-bright); cursor: pointer;
  }
  @media (max-width: 640px) {
    .table-scroll { max-height: 40vh; }
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
  }
</style>
