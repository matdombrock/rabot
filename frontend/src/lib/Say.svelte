<script>
  export let guildId = '';

  let channels = [];
  let channelId = '';
  let text = '';
  let status = '';
  let sending = false;
  let logs = [];
  let logStatus = '';

  async function loadChannels() {
    channels = [];
    channelId = '';
    if (!guildId) return;
    const r = await fetch(`/api/guild/${guildId}/channels`);
    channels = await r.json();
  }

  async function loadLogs() {
    if (!guildId) return;
    try {
      const r = await fetch(`/api/guild/${guildId}/logs/say`);
      if (!r.ok) throw new Error(await r.text());
      logs = await r.json();
      logStatus = logs.length ? `${logs.length} message(s)` : '';
    } catch (err) {
      logStatus = 'Error: ' + err.message;
    }
  }

  async function send() {
    if (!channelId || !text.trim()) return;
    sending = true;
    status = 'Sending...';
    try {
      const r = await fetch(`/api/guild/${guildId}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, content: text }),
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
    await fetch(`/api/guild/${guildId}/logs/say/${id}`, { method: 'DELETE' });
    await loadLogs();
  }

  $: canSend = channelId && text.trim();
  $: if (guildId) { loadChannels(); loadLogs(); }
</script>

<div class="row">
  <select bind:value={channelId} disabled={!guildId}>
    <option value="">{guildId ? 'Select channel...' : 'Enter guild ID first'}</option>
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
<div class="table-scroll">
  {#if logs.length === 0}
    <p style="color:var(--text-muted)">No messages sent yet.</p>
  {:else}
    <table class="responsive-table">
      <thead><tr><th>Time</th><th>Channel</th><th>Content</th><th></th></tr></thead>
      <tbody>
        {#each logs as e}
          <tr>
            <td style="white-space:nowrap">{new Date(e.timestamp).toLocaleString()}</td>
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
  textarea { width: 100%; margin-top: 0.5rem; }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  @media (max-width: 640px) {
    .table-scroll { max-height: 40vh; }
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
  }
</style>
