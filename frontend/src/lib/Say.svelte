<script>
  import { onMount } from 'svelte';

  let guilds = [];
  let channels = [];
  let guildId = '';
  let channelId = '';
  let text = '';
  let status = '';
  let sending = false;
  let logs = [];
  let logStatus = '';

  async function loadGuilds() {
    try {
      const r = await fetch('/api/guilds');
      guilds = await r.json();
    } catch (err) {
      status = 'Error: ' + err.message;
    }
  }

  async function loadChannels() {
    channels = [];
    channelId = '';
    if (!guildId) return;
    const r = await fetch(`/api/channels/${guildId}`);
    channels = await r.json();
  }

  async function loadLogs() {
    try {
      const r = await fetch('/api/saylogs');
      if (!r.ok) throw new Error(await r.text());
      logs = await r.json();
      logStatus = logs.length ? `${logs.length} message(s)` : '';
    } catch (err) {
      logStatus = 'Error: ' + err.message;
    }
  }

  async function send() {
    if (!guildId || !channelId || !text.trim()) return;
    sending = true;
    status = 'Sending...';
    try {
      const r = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId, channelId, content: text }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      status = 'Sent!';
      text = '';
      await loadLogs();
    } catch (err) {
      status = 'Error: ' + err.message;
    } finally {
      sending = false;
    }
  }

  async function del(id) {
    if (!confirm('Delete this message from the server?')) return;
    await fetch(`/api/saylogs/${id}`, { method: 'DELETE' });
    await loadLogs();
  }

  function onGuildChange() {
    channels = [];
    channelId = '';
    if (guildId) loadChannels();
  }

  $: canSend = guildId && channelId && text.trim();

  onMount(() => {
    loadGuilds();
    loadLogs();
  });
</script>

<div class="row">
  <select bind:value={guildId} on:change={onGuildChange}>
    <option value="">Select guild...</option>
    {#each guilds as g}
      <option value={g.id}>{g.name}</option>
    {/each}
  </select>
  <select bind:value={channelId} disabled={!guildId}>
    <option value="">Select channel...</option>
    {#each channels as ch}
      <option value={ch.id}>#{ch.name}</option>
    {/each}
  </select>
  <button on:click={send} disabled={!canSend || sending}>Send</button>
</div>
<textarea bind:value={text} placeholder="Type a message..."></textarea>
<div class="status">{status}</div>

<h3 style="margin-top:1rem;font-size:1rem;color:var(--text-muted)">History</h3>
<div class="status">{logStatus}</div>
<div class="table-wrap">
  {#if logs.length === 0}
    <p style="color:var(--text-muted)">No messages sent yet.</p>
  {:else}
    <table>
      <thead><tr><th>Time</th><th>Guild</th><th>Channel</th><th>Content</th><th></th></tr></thead>
      <tbody>
        {#each logs as e}
          <tr>
            <td style="white-space:nowrap">{new Date(e.timestamp).toLocaleString()}</td>
            <td>{e.guildName}</td>
            <td>#{e.channelName}</td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{e.content}</td>
            <td><button class="btn-sm btn-danger" on:click={() => del(e.id)}>Delete</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  textarea { width: 100%; margin-top: 0.5rem; }
  .status { margin-top: 0.5rem; color: var(--text-muted); font-size: 0.85rem; }
  .table-wrap { margin-top: 0.5rem; max-height: 50vh; overflow: auto; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  tr:hover td { background: var(--surface-alt); }
  .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
  .btn-danger { background: var(--danger); border-color: var(--danger); }
  .btn-danger:hover { background: #a03db8; }
</style>
