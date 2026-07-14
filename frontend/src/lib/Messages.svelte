<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let guildId = '';

  let channels = [];
  let channelId = '';
  let messages = [];
  let nextCursor = null;
  let loading = false;
  let loadingMore = false;
  let searchTerm = '';
  let isSearch = false;

  // Filters
  let members = [];
  let authorId = '';
  let authorInput = '';
  let showAuthorDropdown = false;
  let hasUrl = false;
  let hasImage = false;
  let hasEveryone = false;
  let showFilters = false;

  $: filteredMembers = authorInput
    ? members.filter(m => m.username.toLowerCase().includes(authorInput.toLowerCase()) || (m.display_name || '').toLowerCase().includes(authorInput.toLowerCase()))
    : [];

  async function loadChannels() {
    channels = [];
    channelId = '';
    messages = [];
    if (!guildId) return;
    const r = await fetch(`/api/guild/${guildId}/channels`);
    channels = await r.json();
  }

  async function loadMembers() {
    if (!guildId) return;
    const r = await fetch(`/api/guild/${guildId}/members`);
    members = await r.json();
  }

  function buildUrl(append = false) {
    let url = `/api/guild/${guildId}/messages/${channelId}?limit=50`;
    if (append && nextCursor && !isSearch) url += `&before=${nextCursor}`;
    if (searchTerm) url += `&q=${encodeURIComponent(searchTerm)}`;
    if (authorId) url += `&author_id=${authorId}`;
    if (hasUrl) url += `&has_url=true`;
    if (hasImage) url += `&has_image=true`;
    if (hasEveryone) url += `&has_everyone=true`;
    return url;
  }

  async function loadMessages(append = false) {
    if (!guildId || !channelId) return;
    if (append) { loadingMore = true; } else { loading = true; messages = []; nextCursor = null; }

    try {
      const r = await fetch(buildUrl(append));
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      if (append) {
        messages = [...messages, ...data.messages];
      } else {
        messages = data.messages;
      }
      nextCursor = data.next;
      isSearch = !!data.search;
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function onChannelChange() {
    if (channelId) loadMessages(false);
  }

  function doSearch() {
    loadMessages(false);
  }

  function msgUrl(msg) {
    return `https://discord.com/channels/${guildId}/${msg.channel_id}/${msg.id}`;
  }

  async function copyText(msg) {
    const text = `${msg.username || msg.author_id} at ${new Date(msg.created_at).toLocaleString()}\n${msg.content || ''}`;
    await navigator.clipboard.writeText(text);
  }

  async function copyLink(msg) {
    await navigator.clipboard.writeText(msgUrl(msg));
  }

  function openDiscord(msg) {
    window.open(msgUrl(msg), '_blank');
  }

  function downloadMessages() {
    if (messages.length === 0) return;
    // CSV headers
    const headers = ['ID', 'Channel ID', 'Author ID', 'Username', 'Display Name', 'Created At', 'Content', 'Deleted', 'Message URL'];
    const rows = messages.map(m => [
      m.id,
      m.channel_id,
      m.author_id,
      m.username || '',
      m.display_name || '',
      m.created_at,
      m.content || '',
      (m.deleted === 1 || m._deletedLocally) ? 'Yes' : 'No',
      `https://discord.com/channels/${guildId}/${m.channel_id}/${m.id}`
    ]);
    const csv = [
      headers.map(csvEscape).join(','),
      ...rows.map(r => r.map(csvEscape).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const label = channelId === '_all' ? 'all-channels' : (channels.find(c => c.id === channelId)?.name || channelId);
    a.download = `messages-${label}-${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvEscape(val) {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  async function deleteMessage(msg) {
    if (!confirm('Delete this message from Discord and mark as deleted in the database?')) return;
    // Optimistically mark as deleted in-place
    const idx = messages.findIndex(m => m.id === msg.id);
    if (idx === -1) return;
    const prev = messages[idx];
    messages[idx] = { ...prev, deleted: 1, _deletedLocally: true };
    messages = messages; // trigger reactivity
    try {
      const r = await fetch(`/api/guild/${guildId}/messages/${msg.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await r.text());
    } catch (err) {
      // Revert on failure
      messages[idx] = { ...prev, deleted: 0 };
      messages = messages;
      console.error('Delete failed:', err);
      alert('Failed to delete message: ' + err.message);
    }
  }

  function clearFilters() {
    authorId = '';
    authorInput = '';
    hasUrl = false;
    hasImage = false;
    hasEveryone = false;
  }

  function selectAuthor(m) {
    authorId = m.id;
    authorInput = `${m.username}${m.display_name && m.display_name !== m.username ? ` (${m.display_name})` : ''}`;
    showAuthorDropdown = false;
  }

  $: if (guildId) { loadChannels(); loadMembers(); }
  $: if (channelId) onChannelChange();
</script>

<div class="row search-row">
  <select bind:value={channelId} disabled={!guildId} class="channel-select">
    <option value="">{guildId ? 'Select channel...' : 'Enter guild ID first'}</option>
    <option value="_all">All Channels</option>
    {#each channels as ch}
      <option value={ch.id}>#{ch.name}</option>
    {/each}
  </select>
  <input type="text" placeholder="Search messages..." bind:value={searchTerm} on:keydown={(e) => { if (e.key === 'Enter') doSearch(); }} class="search-input" />
  <button on:click={doSearch}>Search</button>
  <button on:click={() => showFilters = !showFilters} class:active={showFilters}>Filters</button>
</div>

{#if showFilters}
  <div class="filters">
    <div class="row filters-row">
      <label class="filter-label">Author:</label>
      <div class="author-autocomplete">
        <input type="text" placeholder="Type a username..." bind:value={authorInput} on:focus={() => showAuthorDropdown = authorInput.length > 0} on:blur={() => setTimeout(() => showAuthorDropdown = false, 200)} on:input={() => showAuthorDropdown = authorInput.length > 0} class="author-input" />
        {#if showAuthorDropdown && filteredMembers.length > 0}
          <div class="author-dropdown">
            {#each filteredMembers.slice(0, 10) as m}
              <button class="author-option" on:click={() => selectAuthor(m)}>
                {#if m.avatar_url}<img src={m.avatar_url} alt="" class="author-opt-avatar" />{/if}
                <span>{m.username}</span>
                {#if m.display_name && m.display_name !== m.username}
                  <span style="color:var(--text-muted)">({m.display_name})</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <label class="filter-label">
        <input type="checkbox" bind:checked={hasUrl} /> URL
      </label>
      <label class="filter-label">
        <input type="checkbox" bind:checked={hasImage} /> Image
      </label>
      <label class="filter-label">
        <input type="checkbox" bind:checked={hasEveryone} /> @everyone
      </label>
      <button class="btn-sm" on:click={() => { clearFilters(); doSearch(); }}>Clear</button>
    </div>
  </div>
{/if}

<div class="status-row">
  <div class="status">
    {#if loading}
      Loading...
    {:else if isSearch}
      {messages.length} result(s) for "{searchTerm}"
    {:else}
      {messages.length} message(s)
    {/if}
    {#if authorId || hasUrl || hasImage || hasEveryone} <span style="color:var(--primary)">(filtered)</span>{/if}
  </div>
  {#if messages.length > 0}
    <button class="btn-sm" on:click={downloadMessages}>Export CSV</button>
  {/if}
</div>

<div class="msg-list">
  {#if messages.length === 0 && !loading}
    <p style="color:var(--text-muted);padding:1rem">No messages found.</p>
  {/if}

  {#each messages as msg}
    <div class="msg">
      <div class="msg-left">
        {#if msg.avatar_url}
          <img src={msg.avatar_url} alt="" class="msg-avatar clickable" on:click={() => dispatch('analyzeUser', msg.author_id)} />
        {:else}
          <div class="msg-avatar-placeholder clickable" on:click={() => dispatch('analyzeUser', msg.author_id)}></div>
        {/if}
      </div>
      <div class="msg-body">
        <div class="msg-head">
          <span class="msg-author clickable" on:click={() => dispatch('analyzeUser', msg.author_id)}>{msg.username || msg.author_id}</span>
          <span class="msg-time">{new Date(msg.created_at).toLocaleString()}<!-- -->{#if msg.deleted === 1 || msg._deletedLocally} <span class="deleted-tag">(deleted)</span>{/if}</span>
          <span class="msg-actions">
            <button class="action-btn" on:click={() => copyText(msg)} title="Copy text">Copy</button>
            <button class="action-btn" on:click={() => copyLink(msg)} title="Copy Discord link">Link</button>
            <button class="action-btn" on:click={() => openDiscord(msg)} title="Open in Discord">View</button>
            <button class="action-btn action-delete" on:click={() => deleteMessage(msg)} title="Delete from Discord">Delete</button>
          </span>
        </div>
        <div class="msg-content" class:deleted-msg={msg.deleted === 1 || msg._deletedLocally}>{msg.content || '<no content>'}</div>
      </div>
    </div>
  {/each}

  {#if nextCursor && !isSearch}
    <div class="load-more-wrap">
      <button on:click={() => loadMessages(true)} disabled={loadingMore} class="load-more">
        {loadingMore ? 'Loading...' : 'Load more'}
      </button>
    </div>
  {/if}
</div>

<style>
  .search-row { gap: 0.4rem; }
  .channel-select { flex: 1; min-width: 100px; }
  .search-input { flex: 1; min-height: unset; min-width: 100px; }
  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
    flex-wrap: wrap;
  }
  .status { color: var(--text-muted); font-size: 0.85rem; }
  .filters {
    background: var(--surface);
    border: 1px solid var(--surface-alt);
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
  .filters-row { gap: 0.4rem; }
  .filter-label {
    color: var(--text-muted);
    font-size: 0.85rem;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }
  .filter-label input[type="checkbox"] { margin: 0; }
  button.active { background: var(--primary); }
  .author-autocomplete { position: relative; display: inline-block; }
  .author-input {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    min-height: unset;
    width: 150px;
  }
  .author-dropdown {
    position: absolute; top: 100%; left: 0; z-index: 10;
    background: var(--surface); border: 1px solid var(--surface-alt); border-radius: 4px;
    max-height: 200px; overflow-y: auto; min-width: 220px;
  }
  .author-option {
    display: flex; align-items: center; gap: 0.4rem; width: 100%;
    padding: 0.35rem 0.5rem; font-size: 0.8rem; border: none; border-radius: 0;
    background: none; color: var(--text); cursor: pointer; text-align: left;
  }
  .author-option:hover { background: var(--surface-alt); }
  .author-opt-avatar { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .msg-list {
    max-height: 70vh;
    overflow-y: auto;
    border-radius: 4px;
    background: var(--background);
  }
  .msg {
    display: flex;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--surface-alt);
  }
  .msg:hover { background: var(--surface-alt); }
  .msg-left { flex-shrink: 0; }
  .msg-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
  .msg-avatar-placeholder { width: 32px; height: 32px; border-radius: 50%; background: var(--surface-alt); }
  .msg-body { min-width: 0; flex: 1; }
  .msg-head { display: flex; gap: 0.5rem; align-items: flex-start; flex-wrap: wrap; }
  .msg-author { font-weight: 600; color: var(--text-bright); font-size: 0.85rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { filter: brightness(1.3); }
  .msg-time { color: var(--text-muted); font-size: 0.75rem; }
  .msg-actions { margin-left: auto; display: flex; gap: 0.25rem; flex-shrink: 0; }
  .action-btn {
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
    border-radius: 3px;
    border: 1px solid var(--surface-alt);
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
  }
  .action-btn:hover { background: var(--primary); color: var(--text-bright); }
  .action-delete { color: var(--danger); }
  .action-delete:hover { background: var(--danger) !important; color: var(--text-bright); }
  .msg-content { color: var(--text); font-size: 0.85rem; margin-top: 0.15rem; word-break: break-word; white-space: pre-wrap; }
  .msg-content.deleted-msg { color: var(--text-muted); text-decoration: line-through; }
  .deleted-tag { color: var(--danger); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
  .load-more-wrap { display: flex; justify-content: center; padding: 1rem; }
  .load-more { padding: 0.5rem 2rem; }
  @media (max-width: 640px) {
    .search-row { flex-wrap: wrap; }
    .channel-select { flex: 1 1 100%; min-width: 0; }
    .search-input { flex: 1 1 100%; min-width: 0; }
    .author-input { width: 120px; }
    .msg { padding: 0.4rem 0.5rem; gap: 0.5rem; }
    .msg-avatar { width: 28px; height: 28px; }
    .msg-avatar-placeholder { width: 28px; height: 28px; }
    .msg-head { align-items: flex-start; }
    .msg-actions { margin-left: 0; }
    .filter-label { font-size: 0.75rem; }
    .filters-row { gap: 0.25rem; }
  }
</style>
