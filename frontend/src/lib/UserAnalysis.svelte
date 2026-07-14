<script>
  import { tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import UserSearchBox from './UserSearchBox.svelte';
  import AvatarPopup from './AvatarPopup.svelte';
  import { marked } from 'marked';

  let avatarPopup = { show: false, url: '', name: '' };

  function showAvatar(url, name) {
    avatarPopup = { show: true, url, name: name || '' };
  }

  const dispatch = createEventDispatcher();

  export let guildId = '';
  export let analyzeUserId = '';
  export let scanKey = 0;

  let analysis = null;
  let analysisLoading = false;
  let analysisError = '';
  let analysisHistory = [];
  let viewingPastId = null;
  let pastCollapsed = true;
  let searchUsers = [];
  let aiScanResult = null;
  let aiScanLoading = false;
  let aiScanHtml = '';
  let aiScanCached = false;

  function renderMarkdown(text) {
    if (!text) return '';
    try {
      return marked(text, { breaks: true, gfm: true });
    } catch {
      return text.replace(/\n/g, '<br>');
    }
  }
  let aiScanError = '';

  function clearAiScan() {
    aiScanResult = null;
    aiScanError = '';
    aiScanHtml = '';
  }

  // Expose analyzeUser so parent can call it
  export async function analyzeUser(userId) {
    viewingPastId = null;
    analysisLoading = true;
    analysisError = '';
    analysis = null;
    clearAiScan();
    try {
      const r = await fetch(`/api/guild/${guildId}/user-analysis/${userId}`);
      if (!r.ok) throw new Error(await r.text());
      analysis = await r.json();
      loadHistory();
      // Auto-load cached AI scan
      autoLoadAiScan(userId);
      await tick();
      // Scroll this card into view with offset for sticky header
      const el = document.querySelector('.analysis-pane');
      if (el) {
        const header = document.querySelector('.sticky-header');
        const offset = header ? header.getBoundingClientRect().height + 8 : 0;
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    } catch (err) {
      analysisError = err.message;
    } finally {
      analysisLoading = false;
    }
  }

  async function loadHistory() {
    if (!guildId) { analysisHistory = []; return; }
    try {
      const r = await fetch(`/api/guild/${guildId}/history`);
      if (!r.ok) return;
      const all = await r.json();
      analysisHistory = all.filter(r => r.type === 'analysis' || r.type === 'ai-scan');
    } catch {}
  }

  function parseAnalysisCsv(csv) {
    const map = {};
    for (const line of csv.split('\n')) {
      const idx = line.indexOf(',');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      map[key] = val;
    }
    return {
      username: map['Username'] || '',
      displayName: map['Display Name'] || '',
      userId: map['User ID'] || '',
      avatarUrl: map['Avatar'] || '',
      discordJoinDate: map['Discord Join Date'] || '',
      guildJoinDate: map['Guild Join Date'] && map['Guild Join Date'] !== 'N/A' ? map['Guild Join Date'] : null,
      daysInServer: map['Days in Server'] || '',
      accountAgeDays: map['Account Age (days)'] || '',
      topRole: map['Top Role'] || '',
      roles: (map['Roles'] || '').split('; ').filter(Boolean),
      isBoosting: map['Boosting'] === 'Yes',
      isBot: map['Bot'] === 'Yes',
      totalMessages: parseInt(map['Total Messages']) || 0,
      lastPostDate: map['Last Post'] && map['Last Post'] !== 'N/A' ? map['Last Post'] : null,
      csv,
      generated: map['Generated'] || '',
    };
  }

  async function viewPast(id) {
    viewingPastId = id;
    analysisLoading = true;
    analysisError = '';
    analysis = null;
    try {
      const r = await fetch(`/api/guild/${guildId}/history/${id}`);
      if (!r.ok) throw new Error(await r.text());
      const record = await r.json();
      if (record.type === 'ai-scan') {
      analysis = {
        username: record.username || '',
        displayName: '',
        userId: record.username || '',
        avatarUrl: '',
        discordJoinDate: '',
        guildJoinDate: null,
        daysInServer: '',
        accountAgeDays: '',
        topRole: '',
        roles: [],
        isBoosting: false,
        isBot: false,
        totalMessages: 0,
        lastPostDate: null,
        csv: '',
        generated: record.generated || '',
      };
      aiScanResult = { analysis: record.ai_scan || '', riskScore: record.risk_score, niceScore: record.nice_score, weirdScore: record.weird_score, spammerScore: record.spammer_score, aiScore: record.ai_score, userId: record.username };
      aiScanHtml = renderMarkdown(record.ai_scan || '');
    } else {
      analysis = parseAnalysisCsv(record.csv);
    }
    } catch (err) {
      analysisError = err.message;
    } finally {
      analysisLoading = false;
    }
  }

  function viewMessages(userId) {
    dispatch('viewMessages', userId);
  }

  async function autoLoadAiScan(userId) {
    if (!guildId) return;
    try {
      const r = await fetch(`/api/guild/${guildId}/user-ai-scan/${userId}`);
      if (!r.ok) return;
      const data = await r.json();
      if (data.error || !data.cached) return;
      aiScanResult = data;
      aiScanCached = true;
      aiScanHtml = renderMarkdown(data.analysis);
    } catch {}
  }

  async function runAiScan(force = false) {
    if (!analysis) return;
    aiScanLoading = true;
    aiScanError = '';
    aiScanResult = null;
    aiScanHtml = '';
    aiScanCached = false;
    try {
      let url = `/api/guild/${guildId}/user-ai-scan/${analysis.userId}`;
      if (force) url += '?force=true';
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      aiScanResult = data;
      aiScanCached = data.cached;
      aiScanHtml = renderMarkdown(data.analysis);
      loadHistory();
    } catch (err) {
      aiScanError = err.message;
    } finally {
      aiScanLoading = false;
    }
  }

  function closeAnalysis() {
    analysis = null;
    analysisLoading = false;
    analysisError = '';
    viewingPastId = null;
  }

  function downloadAnalysis() {
    if (!analysis) return;
    const blob = new Blob([analysis.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = analysis.generated.replace(/[:.]/g, '-').slice(0, 19);
    a.download = `analysis-${analysis.username}-${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPast(id) {
    const r = await fetch(`/api/guild/${guildId}/history/${id}`);
    const data = await r.json();
    const content = data.type === 'ai-scan' ? (data.ai_scan || '') : (data.csv || '');
    const ext = data.type === 'ai-scan' ? 'txt' : 'csv';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = data.generated.replace(/[:.]/g, '-').slice(0, 19);
    a.download = `scan-${ts}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deletePast(id) {
    if (!confirm('Delete this scan?')) return;
    await fetch(`/api/guild/${guildId}/history/${id}`, { method: 'DELETE' });
    if (viewingPastId === id) closeAnalysis();
    loadHistory();
  }

  $: if (guildId) loadHistory();
  // Trigger scan when scanKey changes (handles re-selecting same or different user)
  $: if (analyzeUserId && scanKey) {
    analyzeUser(analyzeUserId);
  }

  // Load members for UserSearchBox when guild changes
  $: if (guildId) {
    loadMembers();
  }

  async function loadMembers() {
    try {
      const r = await fetch(`/api/guild/${guildId}/members`);
      if (!r.ok) return;
      const members = await r.json();
      searchUsers = members.map(m => ({
        id: m.id,
        username: m.username,
        displayName: m.display_name || '',
        avatarUrl: m.avatar_url || '',
      }));
    } catch {}
  }
</script>

<div class="analysis-pane">
  <div class="analysis-search">
    <UserSearchBox users={searchUsers} placeholder="Search for a user to analyze..." on:select={(e) => analyzeUser(e.detail.id)} />
  </div>

  {#if !guildId}
    <p style="color:var(--text-muted)">Select a guild to scan users.</p>
  {:else if analysisLoading}
    <p style="color:var(--text-muted)">Loading...</p>
  {:else if analysisError}
    <p style="color:var(--danger)">Error: {analysisError}</p>
  {:else if analysis}
    <div class="analysis-body">
      {#if analysis.avatarUrl}
        <img src={analysis.avatarUrl} alt="" class="analysis-avatar clickable" on:click={() => showAvatar(analysis.avatarUrl, analysis.username)} />
      {/if}
      <div class="table-scroll" style="flex:1">
        <table class="analysis-table">
          <tbody>
            <tr><td>Username</td><td>{analysis.username}</td></tr>
            <tr><td>Display Name</td><td>{analysis.displayName}</td></tr>
            <tr><td>User ID</td><td>{analysis.userId}</td></tr>
            <tr><td>Discord Join Date</td><td>{analysis.discordJoinDate ? new Date(analysis.discordJoinDate).toLocaleString() : 'N/A'}</td></tr>
            <tr><td>Guild Join Date</td><td>{analysis.guildJoinDate ? new Date(analysis.guildJoinDate).toLocaleString() : 'N/A'}</td></tr>
            <tr><td>Days in Server</td><td>{analysis.daysInServer}</td></tr>
            <tr><td>Account Age</td><td>{analysis.accountAgeDays} days</td></tr>
            <tr><td>Top Role</td><td>{analysis.topRole}</td></tr>
            <tr><td>Roles</td><td>{analysis.roles.join(', ')}</td></tr>
            <tr><td>Boosting</td><td>{analysis.isBoosting ? 'Yes' : 'No'}</td></tr>
            <tr><td>Bot</td><td>{analysis.isBot ? 'Yes' : 'No'}</td></tr>
            <tr><td>Total Messages</td><td>{analysis.totalMessages}</td></tr>
            <tr><td>Last Post</td><td>{analysis.lastPostDate ? new Date(analysis.lastPostDate).toLocaleString() : 'N/A'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="analysis-actions">
      <button class="btn-sm" on:click={() => viewMessages(analysis.userId)}><i class="fa-solid fa-message"></i> View Messages</button>
      <button class="btn-sm" on:click={() => runAiScan(aiScanCached)} disabled={aiScanLoading}><i class="fa-solid fa-microchip"></i> {aiScanLoading ? 'Scanning...' : aiScanCached ? 'Force Re-scan' : 'AI Scan'}</button>
      <button class="btn-sm" on:click={downloadAnalysis}>Download CSV</button>
      <button class="btn-sm" on:click={closeAnalysis}>Close</button>
    </div>
    <div class="ai-section">
      {#if aiScanLoading}
        <div class="ai-loading">
          <span class="ai-loading-dot">•</span>
          <span class="ai-loading-dot">•</span>
          <span class="ai-loading-dot">•</span>
          <span class="ai-loading-text">AI Scan in progress...</span>
        </div>
      {/if}
      {#if aiScanError}
        <p style="color:var(--danger);font-size:0.85rem;margin-top:0.5rem">Error: {aiScanError}</p>
      {/if}
      {#if aiScanResult}
        <div class="ai-result-header">
          <div class="ai-scores">
            <div class="ai-score">
              <span class="ai-score-label">Risk</span>
              <span class="ai-score-value" class:score-low={aiScanResult.riskScore !== null && aiScanResult.riskScore <= 3} class:score-mid={aiScanResult.riskScore !== null && aiScanResult.riskScore > 3 && aiScanResult.riskScore <= 6} class:score-high={aiScanResult.riskScore !== null && aiScanResult.riskScore > 6}>
                {aiScanResult.riskScore !== null ? `${aiScanResult.riskScore}/10` : 'N/A'}
              </span>
            </div>
            <div class="ai-score">
              <span class="ai-score-label">Nice</span>
              <span class="ai-score-value" class:score-nice-low={aiScanResult.niceScore !== null && aiScanResult.niceScore <= 3} class:score-nice-mid={aiScanResult.niceScore !== null && aiScanResult.niceScore > 3 && aiScanResult.niceScore <= 6} class:score-nice-high={aiScanResult.niceScore !== null && aiScanResult.niceScore > 6}>
                {aiScanResult.niceScore !== null ? `${aiScanResult.niceScore}/10` : 'N/A'}
              </span>
            </div>
            <div class="ai-score">
              <span class="ai-score-label">Weird</span>
              <span class="ai-score-value" class:score-low={aiScanResult.weirdScore !== null && aiScanResult.weirdScore <= 3} class:score-mid={aiScanResult.weirdScore !== null && aiScanResult.weirdScore > 3 && aiScanResult.weirdScore <= 6} class:score-high={aiScanResult.weirdScore !== null && aiScanResult.weirdScore > 6}>
                {aiScanResult.weirdScore !== null ? `${aiScanResult.weirdScore}/10` : 'N/A'}
              </span>
            </div>
            <div class="ai-score">
              <span class="ai-score-label">Spammer</span>
              <span class="ai-score-value" class:score-low={aiScanResult.spammerScore !== null && aiScanResult.spammerScore <= 3} class:score-mid={aiScanResult.spammerScore !== null && aiScanResult.spammerScore > 3 && aiScanResult.spammerScore <= 6} class:score-high={aiScanResult.spammerScore !== null && aiScanResult.spammerScore > 6}>
                {aiScanResult.spammerScore !== null ? `${aiScanResult.spammerScore}/10` : 'N/A'}
              </span>
            </div>
            <div class="ai-score">
              <span class="ai-score-label">AI/LLM</span>
              <span class="ai-score-value" class:score-low={aiScanResult.aiScore !== null && aiScanResult.aiScore <= 3} class:score-mid={aiScanResult.aiScore !== null && aiScanResult.aiScore > 3 && aiScanResult.aiScore <= 6} class:score-high={aiScanResult.aiScore !== null && aiScanResult.aiScore > 6}>
                {aiScanResult.aiScore !== null ? `${aiScanResult.aiScore}/10` : 'N/A'}
              </span>
            </div>
          </div>
          <button class="btn-sm" on:click={() => navigator.clipboard.writeText(aiScanResult.analysis)}><i class="fa-solid fa-copy"></i> Copy</button>
        </div>
        <div class="ai-result">
          {@html aiScanHtml}
        </div>
      {/if}
    </div>
  {:else}
    <p style="color:var(--text-muted)">Search for a user above to scan them.</p>
  {/if}

  {#if analysisHistory.length > 0}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <h4 class="past-toggle" on:click={() => pastCollapsed = !pastCollapsed}>
      <span>Past Scans</span>
      <span class="collapse-icon">{pastCollapsed ? '▾' : '▴'}</span>
    </h4>
    <div class:collapsed={pastCollapsed}>
      <div class="table-scroll">
        <table class="responsive-table">
          <thead>
            <tr>
              <th style="text-align:left;color:var(--text-muted);font-weight:normal">Type</th>
              <th style="text-align:left;color:var(--text-muted);font-weight:normal">User</th>
              <th style="text-align:left;color:var(--text-muted);font-weight:normal">Generated</th>
              <th style="text-align:left;color:var(--text-muted);font-weight:normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each analysisHistory as r}
              <tr>
                <td><span class="type-badge" class:badge-ai={r.type === 'ai-scan'}>{r.type === 'ai-scan' ? 'AI' : 'Scan'}</span></td>
                <td>{r.username || '—'}</td>
                <td class="nowrap">{new Date(r.generated).toLocaleString()}</td>
                <td class="action-cell">
                  <button class="btn-sm" on:click={() => viewPast(r.id)}>View</button>
                  <button class="btn-sm" on:click={() => downloadPast(r.id)}>Download</button>
                  <button class="btn-sm btn-danger" on:click={() => deletePast(r.id)}>Delete</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<AvatarPopup show={avatarPopup.show} url={avatarPopup.url} name={avatarPopup.name} />

<style>
  .analysis-pane {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .table-scroll {
    max-height: 400px;
    overflow: auto;
    border-radius: 4px;
  }
  .analysis-search .user-search-box { width: 100%; }
  .analysis-search .user-search-box input { width: 100%; }
  .analysis-body {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }
  .analysis-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; flex-shrink: 0; cursor: pointer; }
  .analysis-table { width: 100%; font-size: 0.85rem; border-collapse: collapse; }
  .analysis-table td { padding: 0.3rem 0.5rem; border: none; }
  .analysis-table td:first-child { color: var(--text-muted); width: 160px; }
  .past-toggle {
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
  .past-toggle:hover { opacity: 0.8; }
  .collapsed { display: none; }
  .collapse-icon {
    font-size: 0.8rem;
  }
  .type-badge {
    display: inline-block;
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    background: var(--surface-alt);
    color: var(--text-muted);
  }
  .type-badge.badge-ai {
    background: var(--primary);
    color: var(--text-bright);
  }
  .analysis-actions {
    display: flex;
    gap: 0.5rem;
  }
  .ai-section {
    margin-top: 0.5rem;
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
  .ai-result-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }
  .ai-scores {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .ai-score {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    min-width: 48px;
  }
  .ai-score-label {
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }
  .ai-score-value {
    font-size: 1rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }
  .score-low { color: #23a55a; background: #23a55a22; }
  .score-mid { color: #f0b232; background: #f0b23222; }
  .score-high { color: #f23f42; background: #f23f4222; }
  .score-nice-low { color: #f23f42; background: #f23f4222; }
  .score-nice-mid { color: #f0b232; background: #f0b23222; }
  .score-nice-high { color: #23a55a; background: #23a55a22; }
  .ai-result {
    background: var(--background);
    border: 1px solid var(--surface-alt);
    border-radius: 6px;
    padding: 0.75rem;
    max-height: 400px;
    overflow-y: auto;
    font-size: 0.85rem;
    line-height: 1.6;
  }
  .ai-result :global(p) {
    margin-bottom: 0.5rem;
  }
  .ai-result :global(ul), .ai-result :global(ol) {
    margin: 0.25rem 0;
    padding-left: 1.25rem;
  }
  .ai-result :global(li) {
    margin-bottom: 0.15rem;
  }
  .ai-result :global(strong) {
    color: var(--text-bright);
  }
  .ai-result :global(code) {
    background: var(--surface-alt);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.8rem;
  }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); font-weight: normal; }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); white-space: nowrap; }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .nowrap { white-space: nowrap; }
  .action-cell { white-space: nowrap; }
  @media (max-width: 640px) {
    .table-scroll { max-height: 300px; }
    .analysis-body { flex-direction: column; align-items: center; }
    .analysis-avatar { width: 48px; height: 48px; }
    .analysis-table td:first-child { width: 110px; }
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
  }
</style>
