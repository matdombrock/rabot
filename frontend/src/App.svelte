<script>
  import { onMount, tick, afterUpdate } from 'svelte'
  import Sortable from 'sortablejs'
  import Card from './lib/Card.svelte'
  import AiChat from './lib/AiChat.svelte'
  import BotStatus from './lib/BotStatus.svelte'
  import Say from './lib/Say.svelte'
  import ImageFilter from './lib/ImageFilter.svelte'
  import TextFilter from './lib/TextFilter.svelte'
  import QuickReport from './lib/QuickReport.svelte'
  import UserAnalysis from './lib/UserAnalysis.svelte'
  import Messages from './lib/Messages.svelte'
  import Analytics from './lib/Analytics.svelte'
  import ChannelSummary from './lib/ChannelSummary.svelte'
  import GuildScan from './lib/GuildScan.svelte'
  import Settings from './lib/Settings.svelte'
  import ModLog from './lib/ModLog.svelte'
  import AvatarPopup from './lib/AvatarPopup.svelte'
  import Login from './lib/Login.svelte'

  const STORAGE_KEY = 'rb-zero-last-guild-id';
  const ORDER_KEY = 'rb-zero-pane-order';
  const STATE_KEY = 'rb-zero-pane-state';
  const SETTINGS_KEY = 'rb-zero-settings';

  // Pane definitions — name must be unique and stable for localStorage keys
  const paneDefs = [
    { key: 'ai-chat', title: 'AI Chat', description: 'Let users chat with AI by mentioning the bot', icon: 'fa-comment-dots', component: AiChat },
    { key: 'bot-status', title: 'Bot Status', description: 'Bot tag, Node version, uptime, WS latency, and ping', icon: 'fa-robot', component: BotStatus },
    { key: 'user-analysis', title: 'User Scan', description: 'Search, view, and manage per-user scans', icon: 'fa-magnifying-glass', component: UserAnalysis },
    { key: 'user-list', title: 'User List', description: 'All guild members with sortable columns and filters', icon: 'fa-users', component: QuickReport, props: {} },
    { key: 'say', title: 'Say', description: 'Send messages to a channel with send history', icon: 'fa-comment', component: Say },
    { key: 'image-filter', title: 'Image Filter', description: 'Manage SHA256 checksum watchlist and view moderation log', icon: 'fa-image', component: ImageFilter },
    { key: 'channel-summary', title: 'AI Channel Summary', description: 'AI-powered summary of recent channel activity', icon: 'fa-hashtag', component: ChannelSummary },
    { key: 'guild-scan', title: 'AI Guild Scan', description: 'Scan all channels for potentially malicious users', icon: 'fa-shield-halved', component: GuildScan },
    { key: 'analytics', title: 'Analytics', description: 'Server stats, user activity, and message trends with charts', icon: 'fa-chart-simple', component: Analytics },
    { key: 'text-filter', title: 'Text Filter', description: 'Manage text pattern filters with warn/kick/ban actions', icon: 'fa-font', component: TextFilter },
    { key: 'messages', title: 'Messages', description: 'Browse per-channel message history with search, filters, and export', icon: 'fa-message', component: Messages },
    { key: 'settings', title: 'Settings', description: 'Configure dashboard and bot settings', icon: 'fa-gear', component: Settings },
    { key: 'mod-log', title: 'Mod Log', description: 'Track manual mod actions like message deletions and audit log events', icon: 'fa-shield', component: ModLog },
  ];

  // Map for quick lookup
  const paneMap = {};
  for (const p of paneDefs) paneMap[p.key] = p;

  let guildId = '';
  let guilds = [];
  let analyzeUserId = '';
  let scanKey = 0;
  let messagesUserId = '';
  let avatarPopup = { show: false, url: '', name: '' };

  function showAvatar(url, name) {
    avatarPopup = { show: true, url, name: name || '' };
  }
  let ready = false;
  let paneSearch = '';
  let user = null;
  let authChecked = false;
  let guildsLoading = false;

  // Ordered list of pane keys (from localStorage or default)
  let paneOrder = [];
  // Collapsed state per pane key
  let paneCollapsed = {};
  let dashboardSettings = {};

  let sortableInstance = null;
  let focusPaneKey = '';

  $: visible = (title) => !paneSearch || title.toLowerCase().includes(paneSearch.toLowerCase());

  // The final ordered list of pane objects to render
  $: orderedPanes = paneOrder.map(key => paneMap[key]).filter(Boolean);

  function onAnalyzeUser(id) {
    analyzeUserId = id;
    scanKey++;
  }

  function onViewMessages(userId) {
    // Focus messages pane and set author filter — will use bind:authorFilter on Messages
    paneCollapsed = { ...paneCollapsed, messages: false };
    saveState();
    messagesUserId = userId;
    setTimeout(() => {
      const el = document.querySelector('.pane-content [data-pane="messages"]');
      if (el) {
        const header = document.querySelector('.sticky-header');
        const offset = header ? header.getBoundingClientRect().height + 8 : 0;
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }, 100);
  }

  function focusSettings() {
    focusPaneKey = 'settings';
    paneCollapsed = { ...paneCollapsed, settings: false };
    saveState();
    // Scroll to settings pane
    setTimeout(() => {
      document.querySelector('.pane-content [data-pane="settings"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function saveGuildId(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    user = null;
    guildId = '';
    guilds = [];
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) { user = null; authChecked = true; return; }
      user = await res.json();
      authChecked = true;
    } catch {
      user = null;
      authChecked = true;
    }
  }

  async function loadGuilds() {
    guildsLoading = true;
    try {
      const r = await fetch('/api/guilds');
      guilds = await r.json();
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && guilds.some(g => g.id === saved)) {
          guildId = saved;
        }
      } catch {}
    } catch {}
    guildsLoading = false;
    ready = true;
  }

  async function onLogin() {
    await checkAuth();
    if (user) await loadGuilds();
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

  function loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { showTips: true, showQuickSearch: true };
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(dashboardSettings)); } catch {}
  }

  function onSettingChange(e) {
    dashboardSettings = { ...dashboardSettings, [e.detail.key]: e.detail.value };
    saveSettings();
  }

  function onResetOrder() {
    paneOrder = paneDefs.map(p => p.key);
    saveOrder();
  }

  function onResetAll() {
    try {
      localStorage.removeItem(ORDER_KEY);
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    paneOrder = paneDefs.map(p => p.key);
    paneCollapsed = {};
    dashboardSettings = { showTips: true, showQuickSearch: true };
    guildId = '';
  }

  function onCollapsedChange(key, collapsed) {
    paneCollapsed = { ...paneCollapsed, [key]: collapsed };
    saveState();
    // Clear focus after first collapse change
    if (key === 'settings' && focusPaneKey === 'settings') {
      focusPaneKey = '';
    }
  }

  // ── SortableJS drag and drop (works on both desktop and mobile) ──

  function initSortable() {
    const el = document.getElementById('pane-container');
    if (!el) return;
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(el, {
      animation: 200,
      handle: '.pane-handle',
      draggable: '.pane',
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return;
        const newOrder = [...paneOrder];
        const [moved] = newOrder.splice(evt.oldIndex, 1);
        newOrder.splice(evt.newIndex, 0, moved);
        paneOrder = newOrder;
        saveOrder();
      },
    });
  }

  onMount(async () => {
    paneOrder = loadOrder();
    paneCollapsed = loadState();
    dashboardSettings = loadSettings();

    await checkAuth();
    if (!user) return;
    await loadGuilds();
  });

  $: if (ready && guildId) saveGuildId(guildId);
  $: selectedGuild = guilds.find(g => g.id === guildId);
  $: iconUrl = selectedGuild?.icon ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png` : null;
  $: memberCount = selectedGuild?.memberCount ?? null;
  $: onlineCount = selectedGuild?.onlineCount ?? null;

  // Re-init Sortable after the pane list is rendered/updated
  $: if (orderedPanes.length > 0) {
    tick().then(() => initSortable());
  }
</script>

<header class="sticky-header">
  <div class="header-top">
    <h1><img src="/avatar.png" alt="" class="header-logo" /> rb-zero</h1>
    <div class="header-actions">
      {#if user}
        <span class="header-user">{user.username}</span>
        <button class="header-logout-btn" on:click={logout} title="Log out">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      {/if}
      <button class="header-settings-btn" on:click={focusSettings} title="Settings">
        <i class="fa-solid fa-gear"></i>
      </button>
    </div>
  </div>

  <div class="guild-bar">
    <div class="guild-bar-main">
      <div class="guild-inputs">
        <div class="guild-row">
          <label for="guild-id">Guild ID:</label>
          <input id="guild-id" type="text" placeholder="Enter guild ID..." bind:value={guildId} />
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
      {#if selectedGuild}
        <div class="guild-info">
          {#if iconUrl}
            <img src={iconUrl} alt={selectedGuild.name} class="guild-icon-large" />
          {/if}
          <div class="guild-details">
            <span class="guild-name">{selectedGuild.name}</span>
            <div class="guild-stats">
              <span class="guild-stat"><i class="fa-solid fa-user"></i> {memberCount?.toLocaleString() ?? '...'}</span>
              <span class="guild-stat online"><i class="fa-solid fa-circle"></i> {onlineCount?.toLocaleString() ?? '...'}</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>

{#if !authChecked}
  <div class="loading">Loading...</div>
{:else if !user}
  <Login on:login={onLogin} />
{:else if !ready}
  <div class="loading">Loading guilds...</div>
{:else}
{#if dashboardSettings.showQuickSearch !== false}
<Card title="Quick Search" icon="fa-magnifying-glass" expanded={true}>
  <input type="text" placeholder="Type to filter panes..." bind:value={paneSearch} class="pane-search-input" />
</Card>
{/if}

<div id="pane-container">
{#each orderedPanes as pane, i (pane.key)}
  <div
    class="pane"
    class:pane-hidden={!visible(pane.title)}
    data-index={i}
  >
    <div class="pane-handle" title="Drag to reorder">⠿</div>
    <div class="pane-content">
      {#if pane.key === 'user-list'}
        <Card
          title={pane.title}
          icon={pane.icon}
          description={dashboardSettings.showTips !== false ? pane.description : ''}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <QuickReport {guildId} on:analyzeUser={(e) => onAnalyzeUser(e.detail)} on:viewMessages={(e) => onViewMessages(e.detail)} />
        </Card>
      {:else if pane.key === 'user-analysis'}
        <Card
          title={pane.title}
          icon={pane.icon}
          description={dashboardSettings.showTips !== false ? pane.description : ''}
          expanded={!!analyzeUserId}
          forceOpen={scanKey}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <UserAnalysis {guildId} analyzeUserId={analyzeUserId} scanKey={scanKey} on:viewMessages={(e) => onViewMessages(e.detail)} />
        </Card>
      {:else if pane.key === 'messages'}
        <Card
          title={pane.title}
          icon={pane.icon}
          description={pane.description}
          forceOpen={messagesUserId ? 1 : 0}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <div data-pane="messages">
            <Messages {guildId} authorFilter={messagesUserId} on:analyzeUser={(e) => onAnalyzeUser(e.detail)} />
          </div>
        </Card>
      {:else if pane.key === 'settings'}
        <Card
          title={pane.title}
          icon={pane.icon}
          description={dashboardSettings.showTips !== false ? pane.description : ''}
          expanded={focusPaneKey === 'settings'}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <div data-pane="settings">
            <Settings {guildId} settings={dashboardSettings} on:change={onSettingChange} on:resetOrder={onResetOrder} on:resetAll={onResetAll} />
          </div>
        </Card>
      {:else}
        <Card
          title={pane.title}
          icon={pane.icon}
          description={dashboardSettings.showTips !== false ? pane.description : ''}
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
</div>

<AvatarPopup show={avatarPopup.show} url={avatarPopup.url} name={avatarPopup.name} />
{/if}

<style>
  .sticky-header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--background);
    padding-bottom: 1rem;
    margin-bottom: 1rem;
  }
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .header-top h1 {
    margin-bottom: 0;
    font-size: 1.2rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .header-logo {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    object-fit: cover;
  }
  .header-settings-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.35rem;
    border-radius: 4px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .header-settings-btn:hover {
    color: var(--text-bright);
    background: var(--surface);
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .header-user {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .header-logout-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1rem;
    cursor: pointer;
    padding: 0.35rem;
    border-radius: 4px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .header-logout-btn:hover {
    color: var(--danger);
    background: var(--surface);
  }
  .loading {
    text-align: center;
    color: var(--text-muted);
    padding: 4rem 0;
    font-size: 0.95rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  .loading::before {
    content: '';
    width: 32px;
    height: 32px;
    border: 3px solid var(--surface-alt);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .guild-bar {
    padding: 0.75rem 1rem;
    background: var(--surface);
    border-radius: 8px;
  }
  .guild-bar-main {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  .guild-inputs {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
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
    min-width: fit-content;
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
  .guild-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }
  .guild-icon-large {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
  }
  .guild-details {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .guild-name {
    color: var(--text-bright);
    font-size: 1.2rem;
    font-weight: 700;
  }
  .guild-stats {
    display: flex;
    gap: 1rem;
  }
  .guild-stat {
    font-size: 0.9rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .guild-stat i {
    font-size: 0.7rem;
  }
  .guild-stat.online i {
    color: #23a55a;
  }

  @media (max-width: 700px) {
    .guild-info {
      display: none;
    }
  }

  #pane-container { min-height: 1px; }
  .pane {
    display: flex;
    align-items: stretch;
    gap: 0;
    margin-bottom: 0.5rem;
    transition: opacity 0.15s;
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
    touch-action: none;
  }
  .pane.sortable-ghost { opacity: 0.3; }
  .pane.sortable-ghost .pane-content { outline: 2px dashed var(--primary); outline-offset: -2px; border-radius: 8px; }
  .pane:hover .pane-handle,
  .pane-handle:active { opacity: 0.8; }
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
