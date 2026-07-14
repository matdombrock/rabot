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

<div class="row">
  <select bind:value={channelId} disabled={!guildId} style="flex:1">
    <option value="">{guildId ? 'Select channel...' : 'Enter guild ID first'}</option>
    <option value="_all">All Channels</option>
    {#each channels as ch}
      <option value={ch.id}>#{ch.name}</option>
    {/each}
  </select>
  <input type="text" placeholder="Search messages..." bind:value={searchTerm} on:keydown={(e) => { if (e.key === 'Enter') doSearch(); }} style="flex:1" />
  <button on:click={doSearch}>Search</button>
  <button on:click={() => showFilters = !showFilters} class:active={showFilters}>Filters</button>
</div>

{#if showFilters}
  <div class="filters">
    <div class="row">
      <label style="color:var(--text-muted);font-size:0.85rem">Author:</label>
      <div class="author-autocomplete">
        <input type="text" placeholder="Type a username..." bind:value={authorInput} on:focus={() => showAuthorDropdown = authorInput.length > 0} on:blur={() => setTimeout(() => showAuthorDropdown = false, 200)} on:input={() => showAuthorDropdown = authorInput.length > 0} style="padding:0.25rem 0.5rem;font-size:0.8rem;min-height:unset;width:180px" />
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
      <label style="color:var(--text-muted);font-size:0.85rem">
        <input type="checkbox" bind:checked={hasUrl} /> URL
      </label>
      <label style="color:var(--text-muted);font-size:0.85rem">
        <input type="checkbox" bind:checked={hasImage} /> Image
      </label>
      <label style="color:var(--text-muted);font-size:0.85rem">
        <input type="checkbox" bind:checked={hasEveryone} /> @everyone
      </label>
      <button class="btn-sm" on:click={() => { clearFilters(); doSearch(); }}>Clear</button>
    </div>
  </div>
{/if}

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
          <span class="msg-time">{new Date(msg.created_at).toLocaleString()}</span>
          <span class="msg-actions">
            <button class="action-btn" on:click={() => copyText(msg)} title="Copy text">Copy</button>
            <button class="action-btn" on:click={() => copyLink(msg)} title="Copy Discord link">Link</button>
            <button class="action-btn" on:click={() => openDiscord(msg)} title="Open in Discord">View</button>
          </span>
        </div>
        <div class="msg-content">{msg.content || '<no content>'}</div>
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
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .status { color: var(--text-muted); font-size: 0.85rem; margin: 0.5rem 0; }
  .filters {
    background: var(--surface);
    border: 1px solid var(--surface-alt);
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
  .filters select { padding: 0.25rem 0.5rem; font-size: 0.8rem; }
  .filters input[type="checkbox"] { margin-right: 0.25rem; }
  button.active { background: var(--primary); }
  .author-autocomplete { position: relative; display: inline-block; }
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
  .author-opt-avatar { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }
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
  .msg-head { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
  .msg-author { font-weight: 600; color: var(--text-bright); font-size: 0.85rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { filter: brightness(1.3); }
  .msg-time { color: var(--text-muted); font-size: 0.75rem; }
  .msg-actions { margin-left: auto; display: flex; gap: 0.25rem; }
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
  .msg-content { color: var(--text); font-size: 0.85rem; margin-top: 0.15rem; word-break: break-word; white-space: pre-wrap; }
  .load-more-wrap { display: flex; justify-content: center; padding: 1rem; }
  .load-more { padding: 0.5rem 2rem; }
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
</style>
