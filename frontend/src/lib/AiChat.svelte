<script>
  export let guildId = '';

  let enabled = false;
  let prompt = '';
  let promptDraft = '';
  let logs = [];
  let loading = false;
  let saving = false;
  let saveMsg = '';

  async function load() {
    if (!guildId) { logs = []; return; }
    loading = true;
    try {
      const r = await fetch(`/api/guild/${guildId}/ai-chat`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      enabled = data.enabled;
      prompt = data.prompt || '';
      promptDraft = prompt;
      logs = data.logs || [];
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function toggle() {
    try {
      const r = await fetch(`/api/guild/${guildId}/ai-chat/toggle`, { method: 'PUT' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      enabled = data.enabled;
    } catch (err) {
      console.error(err);
    }
  }

  async function savePrompt() {
    saving = true;
    saveMsg = '';
    try {
      const r = await fetch(`/api/guild/${guildId}/ai-chat/prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptDraft }),
      });
      if (!r.ok) throw new Error(await r.text());
      prompt = promptDraft;
      saveMsg = 'Saved';
      setTimeout(() => saveMsg = '', 2000);
    } catch (err) {
      console.error(err);
      saveMsg = 'Failed to save';
    } finally {
      saving = false;
    }
  }

  function resetPrompt() {
    promptDraft = '';
  }

  async function deleteLog(id) {
    if (!confirm('Delete this chat entry?')) return;
    try {
      await fetch(`/api/guild/${guildId}/ai-chat/log/${id}`, { method: 'DELETE' });
      logs = logs.filter(l => l.id !== id);
    } catch (err) {
      console.error(err);
    }
  }

  $: promptDirty = promptDraft !== prompt;
  $: charCount = promptDraft.length;
  $: charClass = charCount > 900 ? 'warn' : charCount > 1024 ? 'over' : '';

  $: if (guildId) load();
</script>

<div class="ai-chat">
  <div class="toggle-row">
    <span class="toggle-label">AI Chat</span>
    <label class="toggle">
      <input type="checkbox" checked={enabled} on:change={toggle} />
      <span class="toggle-slider"></span>
    </label>
    <span class="toggle-hint">{enabled ? 'Enabled — mention the bot in any channel to chat' : 'Disabled'}</span>
  </div>

  <div class="prompt-section">
    <div class="prompt-header">
      <span class="prompt-label">System Prompt</span>
      <span class="prompt-hint">Per-guild override. Leave empty to use the default.</span>
    </div>
    <textarea
      class="prompt-editor"
      bind:value={promptDraft}
      placeholder="Enter a custom system prompt for this guild, or leave empty for the default..."
      rows="6"
      maxlength="1024"
    ></textarea>
    <div class="prompt-char-count {charClass}">{charCount}/1024</div>
    <div class="prompt-actions">
      <button class="btn-sm" on:click={savePrompt} disabled={saving || !promptDirty}>
        {saving ? 'Saving...' : 'Save'}
      </button>
      {#if saveMsg}
        <span class="save-msg">{saveMsg}</span>
      {/if}
      {#if promptDirty}
        <button class="btn-sm" on:click={() => { promptDraft = prompt; }}>Cancel</button>
      {/if}
      {#if prompt}
        <button class="btn-sm" on:click={resetPrompt} title="Clear custom prompt to fall back to default">Reset to default</button>
      {/if}
    </div>
  </div>

  {#if logs.length > 0}
    <div class="log-list">
      {#each logs as log}
        <div class="log-entry">
          <div class="log-header">
            <span class="log-user"><i class="fa-solid fa-user"></i> {log.user_name || log.user_id}</span>
            <span class="log-channel">#{log.channel_name}</span>
            <span class="log-time">{new Date(log.created_at).toLocaleString()}</span>
            <button class="btn-sm btn-danger" on:click={() => deleteLog(log.id)} title="Delete">×</button>
          </div>
          <div class="log-question"><strong>Q:</strong> {log.question}</div>
          <div class="log-response"><strong>A:</strong> {log.response}</div>
        </div>
      {/each}
    </div>
  {:else if !loading}
    <p style="color:var(--text-muted);font-size:0.85rem">No AI chat history yet.</p>
  {/if}
</div>

<style>
  .ai-chat {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    background: var(--background);
    border-radius: 6px;
  }
  .toggle-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
  }
  .toggle-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .toggle {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
  .toggle-slider {
    position: absolute; inset: 0;
    background: var(--surface-alt);
    border-radius: 10px;
    transition: background 0.2s;
  }
  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 16px; height: 16px;
    left: 2px; bottom: 2px;
    background: var(--text-muted);
    border-radius: 50%;
    transition: transform 0.2s, background 0.2s;
  }
  .toggle input:checked + .toggle-slider { background: var(--primary); }
  .toggle input:checked + .toggle-slider::before { transform: translateX(16px); background: var(--text-bright); }
  .prompt-section {
    background: var(--background);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
  }
  .prompt-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .prompt-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
  }
  .prompt-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .prompt-editor {
    width: 100%;
    min-height: 100px;
    font-size: 0.85rem;
    font-family: inherit;
    resize: vertical;
  }
  .prompt-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .save-msg {
    font-size: 0.8rem;
    color: var(--primary);
  }
  .prompt-char-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: right;
    margin-top: 0.25rem;
  }
  .prompt-char-count.warn {
    color: #e0a020;
  }
  .log-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 60vh;
    overflow-y: auto;
  }
  .log-entry {
    background: var(--background);
    border: 1px solid var(--surface-alt);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
  }
  .log-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.35rem;
  }
  .log-user { font-size: 0.8rem; color: var(--text-bright); font-weight: 600; }
  .log-user i { margin-right: 0.2rem; }
  .log-channel { font-size: 0.75rem; color: var(--text-muted); }
  .log-time { font-size: 0.7rem; color: var(--text-muted); margin-left: auto; }
  .log-question { font-size: 0.85rem; color: var(--text); margin-bottom: 0.2rem; word-break: break-word; }
  .log-response { font-size: 0.85rem; color: var(--text-muted); word-break: break-word; white-space: pre-wrap; }
</style>
