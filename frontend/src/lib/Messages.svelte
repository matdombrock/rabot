<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  import UserSearchBox from './UserSearchBox.svelte';

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
  let hasUrl = false;
  let hasImage = false;
  let hasEveryone = false;
  let showDeleted = true;
  let deletedOnly = false;
  let showFilters = false;

  // Normalise members to UserSearchBox format
  $: searchUsers = members.map(m => ({
    id: m.id,
    username: m.username,
    displayName: m.display_name || '',
    avatarUrl: m.avatar_url || '',
  }));

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
    if (!showDeleted) url += `&show_deleted=false`;
    if (deletedOnly) url += `&deleted_only=true`;
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

  function htmlEscape(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function msgTimestamp(ts) {
    return new Date(ts).toLocaleString();
  }

  function msgDate(ts) {
    return new Date(ts).toLocaleDateString();
  }

  async function exportChannelHtml() {
    if (!guildId || !channelId) return;
    const channelName = channelId === '_all' ? 'all-channels' : (channels.find(c => c.id === channelId)?.name || channelId);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    let exporting = true;
    try {
      const r = await fetch(`/api/guild/${guildId}/messages/${channelId}/export`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const allMessages = data.messages;

      // Group messages by date
      let currentDate = '';
      let messagesHtml = '';

      for (const m of allMessages) {
        const d = msgDate(m.created_at);
        if (d !== currentDate) {
          currentDate = d;
          messagesHtml += `<div class="date-sep"><span>${htmlEscape(d)}</span></div>`;
        }

        const isDeleted = m.deleted === 1;
        const avatarUrl = m.avatar_url || '';
        const displayName = m.display_name || m.username || m.author_id;
        const username = m.username || m.author_id;

        messagesHtml += `
          <div class="msg" data-created="${m.created_at}">
            <div class="msg-left">
              ${avatarUrl ? `<img src="${htmlEscape(avatarUrl)}" alt="" class="avatar" />` : `<div class="avatar-placeholder"></div>`}
            </div>
            <div class="msg-body">
              <div class="msg-head">
                <span class="author">${htmlEscape(displayName)}</span>
                <span class="time">${htmlEscape(msgTimestamp(m.created_at))}</span>
                ${isDeleted ? '<span class="deleted">(deleted)</span>' : ''}
              </div>
              <div class="content">${htmlEscape(m.content || '[no text content]')}</div>
            </div>
          </div>`;
      }

      const guildName = guildId;

      const inlineJs = `var reverseOrder = true;
var msgs = document.getElementById('messages');

function filterMessages() {
  var q = document.getElementById('searchInput').value.toLowerCase();
  var container = document.getElementById('messages');
  var allMsgs = container.querySelectorAll('.msg');
  var visibleCount = 0;
  for (var i = 0; i < allMsgs.length; i++) {
    var text = (allMsgs[i].textContent || '').toLowerCase();
    var match = !q || text.indexOf(q) !== -1;
    if (match) {
      allMsgs[i].classList.remove('msg-hidden');
      visibleCount++;
    } else {
      allMsgs[i].classList.add('msg-hidden');
    }
  }
  // Hide date separators that have no visible messages after them
  var seps = container.querySelectorAll('.date-sep');
  for (var j = 0; j < seps.length; j++) {
    var next = seps[j].nextElementSibling;
    var hasVisible = false;
    while (next) {
      if (next.classList.contains('date-sep')) break;
      if (!next.classList.contains('msg-hidden')) {
        hasVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    if (q && !hasVisible) {
      seps[j].classList.add('msg-hidden');
    } else {
      seps[j].classList.remove('msg-hidden');
    }
  }
  document.getElementById('msgCount').textContent = visibleCount + ' / ' + allMsgs.length + ' messages';
}

function toggleOrder() {
  var container = document.getElementById('messages');
  reverseOrder = !reverseOrder;

  // Collect all messages sorted by timestamp (ascending = oldest first)
  var allMsgs = Array.from(document.querySelectorAll('#messages .msg')).sort(function(a, b) {
    return parseInt(a.getAttribute('data-created')) - parseInt(b.getAttribute('data-created'));
  });

  // Remove all existing children (date separators) — but keep msg elements
  while (container.firstChild) container.removeChild(container.firstChild);

  if (reverseOrder) allMsgs.reverse();

  // Rebuild: date separators + messages in order
  var lastDate = null;
  for (var i = 0; i < allMsgs.length; i++) {
    var d = new Date(parseInt(allMsgs[i].getAttribute('data-created'))).toLocaleDateString();
    if (d !== lastDate) {
      var sep = document.createElement('div');
      sep.className = 'date-sep';
      var span = document.createElement('span');
      span.textContent = d;
      sep.appendChild(span);
      container.appendChild(sep);
      lastDate = d;
    }
    container.appendChild(allMsgs[i]);
  }
  document.getElementById('orderBtn').textContent = reverseOrder ? '▼ Newest first' : '▲ Oldest first';
  filterMessages();
}
`;

      var scriptTagStart = '<' + 'script>';
      var scriptTagEnd = '<' + '/script>';

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>#${htmlEscape(channelName)} — ${htmlEscape(guildName)}</title>
<style>
  :root {
    --bg: #141020;
    --surface: #261E36;
    --surface-alt: #382C4C;
    --primary: #B450FF;
    --text: #DCC8FF;
    --text-muted: #8C78B4;
    --danger: #88329C;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    max-width: 720px;
    margin: 0 auto;
    padding: 1rem;
    line-height: 1.4;
  }
  h1 {
    color: var(--primary);
    font-size: 1.25rem;
    margin-bottom: 0.25rem;
  }
  .subtitle {
    color: var(--text-muted);
    font-size: 0.8rem;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--surface-alt);
  }
  .controls {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .controls input {
    flex: 1;
    min-width: 120px;
    background: var(--surface);
    border: 1px solid var(--surface-alt);
    border-radius: 4px;
    padding: 0.4rem 0.6rem;
    color: var(--text);
    font-family: inherit;
    font-size: 0.85rem;
  }
  .controls input:focus { outline: none; border-color: var(--primary); }
  .controls input::placeholder { color: var(--text-muted); }
  .controls button {
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--surface-alt);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-size: 0.8rem;
    white-space: nowrap;
    min-width: 130px;
  }
  .controls button:hover { background: var(--primary); }
  .controls .count {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-left: auto;
  }
  .date-sep {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1.5rem 0 0.75rem;
  }
  .date-sep::before,
  .date-sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--surface-alt);
  }
  .date-sep span {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .msg {
    display: flex;
    gap: 0.6rem;
    padding: 0.35rem 0.5rem;
    border-radius: 4px;
  }
  .msg:hover { background: var(--surface); }
  .msg-left { flex-shrink: 0; width: 32px; }
  .avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
  .avatar-placeholder { width: 32px; height: 32px; border-radius: 50%; background: var(--surface-alt); }
  .msg-body { min-width: 0; flex: 1; }
  .msg-head { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
  .author { font-weight: 600; font-size: 0.85rem; color: var(--text-bright); }
  .time { font-size: 0.7rem; color: var(--text-muted); }
  .deleted { font-size: 0.65rem; color: var(--danger); font-weight: 600; text-transform: uppercase; }
  .content { font-size: 0.85rem; margin-top: 0.1rem; word-break: break-word; white-space: pre-wrap; }
  .msg-hidden { display: none; }
  @media (max-width: 480px) {
    body { padding: 0.5rem; }
    h1 { font-size: 1.1rem; }
    .msg { padding: 0.3rem 0.25rem; gap: 0.4rem; }
    .msg-left { width: 28px; }
    .avatar, .avatar-placeholder { width: 28px; height: 28px; }
  }
</style>
</head>
<body>
<h1>#${htmlEscape(channelName)}</h1>
<p class="subtitle">${htmlEscape(guildName)} — ${allMessages.length} messages — ${htmlEscape(ts)}</p>
<div class="controls">
  <input type="text" id="searchInput" placeholder="Search messages..." oninput="filterMessages()" />
  <button onclick="toggleOrder()" id="orderBtn">▼ Newest first</button>
  <span class="count" id="msgCount">${allMessages.length} / ${allMessages.length} messages</span>
</div>
<div id="messages">
${messagesHtml}
</div>
` + scriptTagStart + inlineJs + scriptTagEnd + `
</body>
</html>`;

      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `messages-${htmlEscape(channelName)}-${ts}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export: ' + err.message);
    } finally {
      exporting = false;
    }
  }

  async function deleteMessage(msg) {
    // If already deleted (from a prior session), just mark it in the DB without touching Discord
    if (msg.deleted === 1) {
      if (!confirm('This message was already deleted from Discord. Mark as deleted in the database?')) return;
      try {
        const r = await fetch(`/api/guild/${guildId}/messages/${msg.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(await r.text());
      } catch (err) {
        console.error('Delete failed:', err);
        alert('Failed to mark message as deleted: ' + err.message);
      }
      return;
    }

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
    hasUrl = false;
    hasImage = false;
    hasEveryone = false;
    showDeleted = true;
    deletedOnly = false;
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
      <UserSearchBox users={searchUsers} bind:value={authorId} placeholder="Type a username..." />
      <label class="filter-label">
        <input type="checkbox" bind:checked={hasUrl} /> URL
      </label>
      <label class="filter-label">
        <input type="checkbox" bind:checked={hasImage} /> Image
      </label>
      <label class="filter-label">
        <input type="checkbox" bind:checked={hasEveryone} /> @everyone
      </label>
      <label class="filter-label">
        <input type="checkbox" bind:checked={showDeleted} on:change={doSearch} /> Show deleted
      </label>
      <label class="filter-label">
        <input type="checkbox" bind:checked={deletedOnly} on:change={doSearch} /> Deleted only
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
  <span class="export-buttons">
    {#if messages.length > 0}
      <button class="btn-sm" on:click={downloadMessages}>Export CSV</button>
    {/if}
    {#if channelId}
      <button class="btn-sm" on:click={exportChannelHtml}>Export HTML</button>
    {/if}
  </span>
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
            {#if msg.deleted === 1 || msg._deletedLocally}
              <button class="action-btn action-delete" on:click={() => deleteMessage(msg)} title="Mark as deleted in database">Delete (DB)</button>
            {:else}
              <button class="action-btn action-delete" on:click={() => deleteMessage(msg)} title="Delete from Discord">Delete</button>
            {/if}
          </span>
        </div>
        <div class="msg-content" class:deleted-msg={msg.deleted === 1 || msg._deletedLocally}>{msg.content || '[no text content]'}</div>
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
  .export-buttons {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
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
  .deleted-tag { color: var(--danger); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
  .load-more-wrap { display: flex; justify-content: center; padding: 1rem; }
  .load-more { padding: 0.5rem 2rem; }
  @media (max-width: 640px) {
    .search-row { flex-wrap: wrap; }
    .channel-select { flex: 1 1 100%; min-width: 0; }
    .search-input { flex: 1 1 100%; min-width: 0; }
    .msg { padding: 0.4rem 0.5rem; gap: 0.5rem; }
    .msg-avatar { width: 28px; height: 28px; }
    .msg-avatar-placeholder { width: 28px; height: 28px; }
    .msg-head { align-items: flex-start; }
    .msg-actions { margin-left: 0; }
    .filter-label { font-size: 0.75rem; }
    .filters-row { gap: 0.25rem; }
  }
</style>
