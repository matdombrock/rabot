<script>
  import { marked } from 'marked';

  export let guildId = '';

  let loading = false;
  let error = '';
  let result = null;
  let summaryHtml = '';
  let history = [];
  let cached = false;
  let historyCollapsed = true;

  async function loadHistory() {
    if (!guildId) return;
    try {
      const r = await fetch(`/api/guild/${guildId}/history`);
      if (!r.ok) return;
      const all = await r.json();
      history = all.filter(r => r.type === 'guild-scan');
    } catch {}
  }

  async function run(force = false) {
    if (!guildId) return;
    loading = true;
    error = '';
    result = null;
    summaryHtml = '';
    cached = false;
    try {
      let url = `/api/guild/${guildId}/guild-scan`;
      if (force) url += '?force=true';
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      result = data;
      cached = data.cached;
      summaryHtml = renderMarkdown(data.summary);
      loadHistory();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function viewPast(record) {
    try {
      const r = await fetch(`/api/guild/${guildId}/history/${record.id}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      result = { summary: data.ai_scan, messageCount: data.message_count, generated: data.generated };
      cached = true;
      summaryHtml = renderMarkdown(data.ai_scan);
    } catch (err) {
      error = err.message;
    }
  }

  function renderMarkdown(text) {
    if (!text) return '';
    try {
      return marked(text, { breaks: true, gfm: true });
    } catch {
      return text.replace(/\n/g, '<br>');
    }
  }

  function copySummary() {
    if (result?.summary) {
      navigator.clipboard.writeText(result.summary);
    }
  }

  // Auto-load cached scan when guild changes
  let lastGuildId = '';
  $: if (guildId && guildId !== lastGuildId) {
    lastGuildId = guildId;
    result = null;
    cached = false;
    summaryHtml = '';
    error = '';
    autoLoadCached();
  }

  async function autoLoadCached() {
    if (!guildId) return;
    try {
      const r = await fetch(`/api/guild/${guildId}/guild-scan`);
      if (!r.ok) return;
      const data = await r.json();
      if (data.error || !data.cached) return;
      result = data;
      cached = true;
      summaryHtml = renderMarkdown(data.summary);
    } catch {}
  }

  $: if (guildId) loadHistory();
</script>

<div class="guild-scan">
  <div class="controls-row">
    <button on:click={() => run(cached)} disabled={loading || !guildId}>
      {loading ? 'Scanning...' : cached ? 'Force Re-scan' : 'Run Guild Scan'}
    </button>
  </div>

  {#if error}
    <p style="color:var(--danger);font-size:0.85rem;margin-top:0.5rem">Error: {error}</p>
  {/if}

  {#if loading}
    <div class="ai-loading">
      <span class="ai-loading-dot">•</span>
      <span class="ai-loading-dot">•</span>
      <span class="ai-loading-dot">•</span>
      <span class="ai-loading-text">Scanning all channels for suspicious activity...</span>
    </div>
  {/if}

  {#if result}
    <div class="result-header">
      <div class="result-meta">
        <span class="summary-badge" class:cached={cached}>{cached ? 'Cached' : 'Fresh'}</span>
        <span class="result-info">{result.messageCount} messages — {new Date(result.generated).toLocaleString()}</span>
      </div>
      <button class="btn-sm" on:click={copySummary}><i class="fa-solid fa-copy"></i> Copy</button>
    </div>
    <div class="result-body">
      {@html summaryHtml}
    </div>
  {:else if !loading}
    <p style="color:var(--text-muted);font-size:0.85rem;margin-top:0.5rem">Click <strong>Run Guild Scan</strong> to scan all recent messages across every channel for potentially malicious users.</p>
  {/if}

  {#if history.length > 0}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <h4 class="history-toggle" on:click={() => historyCollapsed = !historyCollapsed}>
      <span>Past Scans ({history.length})</span>
      <span class="collapse-icon">{historyCollapsed ? '▾' : '▴'}</span>
    </h4>
    <div class:collapsed={historyCollapsed}>
      <div class="table-scroll">
        <table class="responsive-table">
          <thead>
            <tr>
              <th>Generated</th>
              <th>Messages</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each history as r}
              <tr>
                <td class="nowrap">{new Date(r.generated).toLocaleString()}</td>
                <td>{r.total_members || r.message_count || '?'}</td>
                <td class="action-cell">
                  <button class="btn-sm" on:click={() => viewPast(r)}>View</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<style>
  .guild-scan {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .controls-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .ai-loading {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.75rem;
    background: var(--background);
    border-radius: 6px;
    margin-top: 0.5rem;
  }
  .ai-loading-text {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-left: 0.25rem;
  }
  .ai-loading-dot {
    font-size: 1.2rem;
    color: var(--primary);
    animation: ai-bounce 1.2s infinite;
  }
  .ai-loading-dot:nth-child(2) { animation-delay: 0.2s; }
  .ai-loading-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes ai-bounce {
    0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-4px); }
  }
  .result-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .summary-badge {
    display: inline-block;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    background: var(--surface-alt);
    color: var(--text-muted);
  }
  .summary-badge.cached {
    background: var(--primary);
    color: var(--text-bright);
  }
  .result-info {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .history-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.75rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    padding: 0.25rem 0;
  }
  .history-toggle:hover { opacity: 0.8; }
  .collapsed { display: none; }
  .collapse-icon { font-size: 0.8rem; }
  .table-scroll { max-height: 300px; overflow: auto; border-radius: 4px; }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); font-weight: normal; }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .nowrap { white-space: nowrap; }
  .action-cell { white-space: nowrap; }
  .result-body {
    background: var(--background);
    border: 1px solid var(--surface-alt);
    border-radius: 6px;
    padding: 0.75rem;
    max-height: 400px;
    overflow-y: auto;
    font-size: 0.85rem;
    line-height: 1.6;
  }
  .result-body :global(p) { margin-bottom: 0.5rem; }
  .result-body :global(ul), .result-body :global(ol) {
    margin: 0.25rem 0;
    padding-left: 1.25rem;
  }
  .result-body :global(li) { margin-bottom: 0.15rem; }
  .result-body :global(strong) { color: var(--text-bright); }
  .result-body :global(code) {
    background: var(--surface-alt);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.8rem;
  }
</style>
