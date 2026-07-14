<script>
  import { onMount, tick } from 'svelte'
  import Card from './lib/Card.svelte'
  import BotStatus from './lib/BotStatus.svelte'
  import Say from './lib/Say.svelte'
  import ImageFilter from './lib/ImageFilter.svelte'
  import TextFilter from './lib/TextFilter.svelte'
  import QuickReport from './lib/QuickReport.svelte'
  import RecentReports from './lib/RecentReports.svelte'
  import Messages from './lib/Messages.svelte'
  import ModLog from './lib/ModLog.svelte'

  const STORAGE_KEY = 'dbot-last-guild-id';
  const ORDER_KEY = 'dbot-pane-order';
  const STATE_KEY = 'dbot-pane-state';

  // Pane definitions — name must be unique and stable for localStorage keys
  const paneDefs = [
    { key: 'bot-status', title: 'Bot Status', description: 'Bot tag, Node version, uptime, WS latency, and ping', component: BotStatus },
    { key: 'user-list', title: 'User List', description: 'All guild members with sortable columns, filters, and user analysis', component: QuickReport, props: {} },
    { key: 'say', title: 'Say', description: 'Send messages to a channel with send history', component: Say },
    { key: 'image-filter', title: 'Image Filter', description: 'Manage SHA256 checksum watchlist and view moderation log', component: ImageFilter },
    { key: 'text-filter', title: 'Text Filter', description: 'Manage text pattern filters with warn/kick/ban actions', component: TextFilter },
    { key: 'recent-reports', title: 'Recent Reports', description: 'Browse, download, and delete generated reports and analyses', component: RecentReports },
    { key: 'messages', title: 'Messages', description: 'Browse per-channel message history with search, filters, and export', component: Messages },
    { key: 'mod-log', title: 'Mod Log', description: 'Track manual mod actions like message deletions and audit log events', component: ModLog },
  ];

  // Map for quick lookup
  const paneMap = {};
  for (const p of paneDefs) paneMap[p.key] = p;

  let guildId = '';
  let guilds = [];
  let analyzeUserId = '';
  let ready = false;
  let paneSearch = '';

  // Ordered list of pane keys (from localStorage or default)
  let paneOrder = [];
  // Collapsed state per pane key
  let paneCollapsed = {};

  // Drag state
  let dragIndex = -1;
  let dragOverIndex = -1;

  $: visible = (title) => !paneSearch || title.toLowerCase().includes(paneSearch.toLowerCase());

  // The final ordered list of pane objects to render
  $: orderedPanes = paneOrder.map(key => paneMap[key]).filter(Boolean);

  function onAnalyzeUser(id) {
    analyzeUserId = id;
  }

  function saveGuildId(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  function saveOrder() {
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(paneOrder)); } catch {}
  }

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(paneCollapsed)); } catch {}
  }

  function loadOrder() {
    try {
      const saved = localStorage.getItem(ORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate: must contain all paneDefs keys, no extras
        const validKeys = new Set(paneDefs.map(p => p.key));
        const filtered = parsed.filter(k => validKeys.has(k));
        // Add any missing keys at the end
        for (const def of paneDefs) {
          if (!filtered.includes(def.key)) filtered.push(def.key);
        }
        return filtered;
      }
    } catch {}
    return paneDefs.map(p => p.key);
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STATE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  }

  function onCollapsedChange(key, collapsed) {
    paneCollapsed = { ...paneCollapsed, [key]: collapsed };
    saveState();
  }

  // ── Drag and drop ──

  function onDragStart(index) {
    dragIndex = index;
  }

  function onDragOver(e, index) {
    e.preventDefault();
    dragOverIndex = index;
  }

  function onDragLeave() {
    dragOverIndex = -1;
  }

  function onDrop(index) {
    if (dragIndex === -1 || dragIndex === index) {
      dragIndex = -1;
      dragOverIndex = -1;
      return;
    }
    const newOrder = [...paneOrder];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(index, 0, moved);
    paneOrder = newOrder;
    saveOrder();
    dragIndex = -1;
    dragOverIndex = -1;
  }

  function onDragEnd() {
    dragIndex = -1;
    dragOverIndex = -1;
  }

  onMount(async () => {
    // Restore pane order and state
    paneOrder = loadOrder();
    paneCollapsed = loadState();

    const r = await fetch('/api/guilds');
    guilds = await r.json();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && guilds.some(g => g.id === saved)) {
        guildId = saved;
      }
    } catch {}
    ready = true;
  });

  $: if (ready && guildId) saveGuildId(guildId);
  $: selectedGuild = guilds.find(g => g.id === guildId);
  $: iconUrl = selectedGuild?.icon ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png` : null;
</script>

<h1>Bot Control Panel</h1>

<div class="guild-bar">
  <div class="guild-row">
    <label for="guild-id">Guild ID:</label>
    <input id="guild-id" type="text" placeholder="Enter guild ID..." bind:value={guildId} />
    {#if iconUrl}
      <img src={iconUrl} alt={selectedGuild.name} class="guild-icon" />
    {/if}
    {#if selectedGuild}
      <span class="guild-name">{selectedGuild.name}</span>
    {/if}
  </div>
  <div class="guild-row">
    <label for="guild-select">Select guild:</label>
    <select id="guild-select" on:change={(e) => { guildId = e.target.value; saveGuildId(e.target.value); }}>
      <option value="">-- choose a guild --</option>
      {#each guilds as g}
        <option value={g.id}>{g.name}</option>
      {/each}
    </select>
  </div>
</div>

<Card title="Quick Search" expanded={true}>
  <input type="text" placeholder="Type to filter panes..." bind:value={paneSearch} class="pane-search-input" />
</Card>

{#each orderedPanes as pane, i (pane.key)}
  <div
    class="pane"
    class:pane-hidden={!visible(pane.title)}
    class:drag-over={dragOverIndex === i && dragIndex !== i}
    draggable={true}
    on:dragstart={() => onDragStart(i)}
    on:dragover={(e) => onDragOver(e, i)}
    on:dragleave={onDragLeave}
    on:drop={() => onDrop(i)}
    on:dragend={onDragEnd}
  >
    <div class="pane-handle" title="Drag to reorder">⠿</div>
    <div class="pane-content">
      {#if pane.key === 'user-list'}
        <Card
          title={pane.title}
          description={pane.description}
          expanded={!!analyzeUserId}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <QuickReport {guildId} {analyzeUserId} />
        </Card>
      {:else if pane.key === 'messages'}
        <Card
          title={pane.title}
          description={pane.description}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <Messages {guildId} on:analyzeUser={(e) => onAnalyzeUser(e.detail)} />
        </Card>
      {:else}
        <Card
          title={pane.title}
          description={pane.description}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <svelte:component this={pane.component} {guildId} />
        </Card>
      {/if}
    </div>
  </div>
{/each}

<style>
  .guild-bar {
    margin-bottom: 1.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .guild-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .guild-row label {
    color: var(--text-muted);
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .guild-row input {
    flex: 1;
    min-height: unset;
    margin-top: 0;
    padding: 0.5rem;
    font-family: monospace;
  }
  .guild-row select {
    flex: 1;
  }
  .guild-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .guild-name {
    color: var(--text-bright);
    font-size: 0.95rem;
  }

  .pane {
    display: flex;
    align-items: stretch;
    gap: 0;
    margin-bottom: 0.5rem;
    transition: opacity 0.15s;
  }
  .pane.drag-over .pane-content {
    outline: 2px dashed var(--primary);
    outline-offset: -2px;
    border-radius: 8px;
  }
  .pane-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    flex-shrink: 0;
    cursor: grab;
    color: var(--text-muted);
    font-size: 1rem;
    user-select: none;
    opacity: 0.4;
    transition: opacity 0.15s;
  }
  .pane:hover .pane-handle,
  .pane-handle:active { opacity: 0.8; }
  .pane-handle:active { cursor: grabbing; }
  .pane-content {
    flex: 1;
    min-width: 0;
  }
  .pane-search-input {
    width: 100%;
    min-height: unset;
    font-size: 1rem;
    padding: 0.65rem 0.75rem;
  }
  .pane-hidden { display: none; }

  @media (max-width: 640px) {
    .pane-handle {
      width: 24px;
      font-size: 0.85rem;
    }
    .guild-row {
      flex-wrap: wrap;
    }
    .guild-row label {
      font-size: 0.8rem;
    }
    .guild-row input {
      min-width: 0;
      width: auto;
    }
  }
</style>
