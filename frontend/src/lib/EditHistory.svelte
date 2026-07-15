<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  import AvatarPopup from './AvatarPopup.svelte';

  export let guildId = '';
  export let messageFilter = '';
  export let authorFilter = '';

  let avatarPopup = { show: false, url: '', name: '' };
  function showAvatar(url, name) {
    avatarPopup = { show: true, url, name: name || '' };
  }

  let edits = [];
  let loading = false;
  let nextCursor = null;
  let countdown = 0;
  let countdownInterval = null;
  let refreshInterval = null;
  let viewingEdit = null;

  function startRefresh() {
    stopRefresh();
    countdown = 10;
    refreshInterval = setInterval(() => { if (guildId) loadEdits(); countdown = 10; }, 10000);
    countdownInterval = setInterval(() => { if (countdown > 0) countdown--; }, 1000);
  }

  function stopRefresh() {
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    countdown = 0;
  }

  $: if (guildId) { loadEdits(); startRefresh(); }
  $: if (messageFilter && guildId) { loadEdits(); }

  async function loadEdits(append = false) {
    if (!guildId) return;
    loading = true;
    try {
      let url = `/api/guild/${guildId}/edits?limit=100`;
      if (append && nextCursor) url += `&before=${nextCursor}`;
      if (messageFilter) url += `&message_id=${messageFilter}`;
      if (authorFilter) url += `&author_id=${authorFilter}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      if (append) { edits = [...edits, ...data.edits]; } else { edits = data.edits; }
      nextCursor = data.next;
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function toggleView(edit) {
    viewingEdit = viewingEdit?.id === edit.id ? null : edit;
  }

  $: if (authorFilter && guildId) { messageFilter = ''; loadEdits(); }
</script>

<div class="row">
  <button on:click={() => { messageFilter = ''; loadEdits(); }}>Refresh</button>
  {#if messageFilter}
    <button class="btn-sm" on:click={() => { messageFilter = ''; loadEdits(); }}>Clear message filter</button>
  {/if}
  {#if authorFilter}
    <button class="btn-sm" on:click={() => { authorFilter = ''; loadEdits(); }}>Clear author filter</button>
  {/if}
</div>

<div class="status-row">
  <div class="status">
    {#if loading}
      Loading...
    {:else}
      {edits.length} edit(s)
    {/if}
    {#if messageFilter} <span style="color:var(--primary)">filtered by message</span>{/if}
    {#if authorFilter} <span style="color:var(--primary)">filtered by author</span>{/if}
    {#if countdown > 0} <span style="color:var(--text-muted);margin-left:0.5rem">refreshing in {countdown}s</span>{/if}
  </div>
</div>

<div class="table-scroll">
  {#if edits.length === 0}
    <p style="color:var(--text-muted);padding:1rem">No edits found.</p>
  {:else}
    <table class="responsive-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Author</th>
          <th>Channel</th>
          <th>Message</th>
          <th>Old</th>
          <th>New</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each edits as e}
          <tr>
            <td class="nowrap">{new Date(e.edited_at).toLocaleString()}</td>
            <td class="nowrap">
              {#if e.avatar_url}
                <img src={e.avatar_url} alt="" class="avatar-small clickable" on:click={() => showAvatar(e.avatar_url, e.username)} />
              {/if}
              {e.username || e.author_id}
            </td>
            <td>{e.channel_id}</td>
            <td class="nowrap"><span class="msg-id clickable" on:click={() => { messageFilter = e.message_id; }}>{e.message_id}</span></td>
            <td class="content-cell">{e.old_content}</td>
            <td class="content-cell">{e.new_content}</td>
            <td class="nowrap">
              <button class="action-btn" class:active={viewingEdit?.id === e.id} on:click={() => toggleView(e)} title="View diff">View</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if viewingEdit}
  <div class="diff-view">
    <div class="diff-header">
      <span>Edit by {viewingEdit.username || viewingEdit.author_id} at {new Date(viewingEdit.edited_at).toLocaleString()}</span>
      <span>Message <span class="msg-id">{viewingEdit.message_id}</span></span>
      <button class="btn-sm" on:click={() => window.open(`https://discord.com/channels/${guildId}/${viewingEdit.channel_id}/${viewingEdit.message_id}`, '_blank')} title="Open in Discord">Discord</button>
      <button class="btn-sm" on:click={() => viewingEdit = null}>Close</button>
    </div>
    <div class="diff-body">
      <div class="diff-col">
        <div class="diff-label old-label">Before</div>
        <div class="diff-content old">{viewingEdit.old_content}</div>
      </div>
      <div class="diff-col">
        <div class="diff-label new-label">After</div>
        <div class="diff-content new">{viewingEdit.new_content}</div>
      </div>
    </div>
  </div>
{/if}

{#if nextCursor}
  <div class="load-more-wrap">
    <button on:click={() => loadEdits(true)} disabled={loading} class="load-more">
      {loading ? 'Loading...' : 'Load more'}
    </button>
  </div>
{/if}

<AvatarPopup show={avatarPopup.show} url={avatarPopup.url} name={avatarPopup.name} />

<style>
  .status-row { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin: 0.5rem 0; flex-wrap: wrap; }
  .status { color: var(--text-muted); font-size: 0.85rem; }
  .table-scroll { margin-top: 0.5rem; max-height: 50vh; }
  @media (max-width: 640px) { .table-scroll { max-height: 35vh; } }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .nowrap { white-space: nowrap; }
  .content-cell { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .avatar-small { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 0.3rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { filter: brightness(1.3); }
  .msg-id { font-size: 0.7rem; color: var(--primary); }
  .action-btn { padding: 0.15rem 0.4rem; font-size: 0.7rem; border-radius: 3px; border: 1px solid var(--surface-alt); background: var(--surface); color: var(--text-muted); cursor: pointer; }
  .action-btn:hover { background: var(--primary); color: var(--text-bright); }
  .load-more-wrap { display: flex; justify-content: center; padding: 1rem; }
  .load-more { padding: 0.5rem 2rem; }
  .diff-view { margin-top: 0.75rem; border: 1px solid var(--surface-alt); border-radius: 6px; overflow: hidden; }
  .diff-header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0.75rem; background: var(--surface-alt); font-size: 0.8rem; color: var(--text-muted); flex-wrap: wrap; }
  .diff-body { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .diff-col { min-width: 0; }
  .diff-label { padding: 0.3rem 0.75rem; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .old-label { background: rgba(136, 50, 156, 0.2); color: var(--danger); }
  .new-label { background: rgba(42, 107, 60, 0.2); color: #6fcf7c; }
  .diff-content { padding: 0.5rem 0.75rem; font-size: 0.8rem; white-space: pre-wrap; word-break: break-word; border-top: 1px solid var(--surface-alt); min-height: 2.5rem; }
  .diff-content.old { background: rgba(136, 50, 156, 0.06); }
  .diff-content.new { background: rgba(42, 107, 60, 0.06); }
  @media (max-width: 640px) {
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th, .responsive-table td { padding: 0.3rem 0.4rem; }
    .content-cell { max-width: 120px; }
  }
</style>
