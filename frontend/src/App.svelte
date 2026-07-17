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
  import ImageDescribe from './lib/ImageDescribe.svelte'
  import EditHistory from './lib/EditHistory.svelte'
  import ReferenceTable from './lib/ReferenceTable.svelte'
  import ComingSoon from './lib/ComingSoon.svelte'

  const STORAGE_KEY = 'rb-zero-last-guild-id';
  const ORDER_KEY = 'rb-zero-pane-order';
  const STATE_KEY = 'rb-zero-pane-state';
  const SETTINGS_KEY = 'rb-zero-settings';

  // Pane definitions — name must be unique and stable for localStorage keys
  const paneDefs = [
    { key: 'log-ai-chat', title: 'AI Chat', description: 'Let users chat with AI by mentioning the bot', icon: 'fa-comment-dots', tag: 'beta', component: AiChat },
    { key: 'ai-image-describe', title: 'AI Image Describe', description: 'Automatically describe uploaded images using AI for accessibility', icon: 'fa-image', tag: 'beta', component: ImageDescribe },
    { key: 'bot-status', title: 'Bot Status', description: 'Bot tag, Node version, uptime, WS latency, and ping', icon: 'fa-robot', tag: 'beta', component: BotStatus },
    { key: 'user-analysis', title: 'User Scan', description: 'Search, view, and manage per-user scans', icon: 'fa-magnifying-glass', tag: 'beta', component: UserAnalysis },
    { key: 'user-list', title: 'User List', description: 'All guild members with sortable columns and filters', icon: 'fa-users', tag: 'beta', component: QuickReport, props: {} },
    { key: 'say', title: 'Say', description: 'Send messages to a channel with send history', icon: 'fa-comment', tag: 'beta', component: Say },
    { key: 'filter-image', title: 'Image Filter', description: 'Manage SHA256 checksum watchlist and view moderation log', icon: 'fa-image', tag: 'beta', component: ImageFilter },
    { key: 'channel-summary', title: 'AI Channel Summary', description: 'AI-powered summary of recent channel activity', icon: 'fa-hashtag', tag: 'beta', component: ChannelSummary },
    { key: 'guild-scan', title: 'AI Guild Scan', description: 'Scan all channels for potentially malicious users', icon: 'fa-shield-halved', tag: 'beta', component: GuildScan },
    { key: 'analytics', title: 'Analytics', description: 'Server stats, user activity, and message trends with charts', icon: 'fa-chart-simple', tag: 'beta', component: Analytics },
    { key: 'filter-text', title: 'Text Filter', description: 'Manage text pattern filters with warn/kick/ban actions', icon: 'fa-font', tag: 'beta', component: TextFilter },
    { key: 'messages', title: 'Messages', description: 'Browse per-channel message history with search, filters, and export', icon: 'fa-message', tag: 'beta', component: Messages },
    { key: 'settings', title: 'Settings', description: 'Configure dashboard and bot settings', icon: 'fa-gear', tag: 'beta', component: Settings },
    { key: 'log-mod', title: 'Mod Log', description: 'Track manual mod actions like message deletions and audit log events', icon: 'fa-shield', tag: 'beta', component: ModLog },
    { key: 'edit-history', title: 'Edit History', description: 'Track message edit history across all channels', icon: 'fa-pen-to-square', tag: 'beta', component: EditHistory },
    { key: 'ref-table', title: 'Reference Table', description: 'Manage reference command entries (static text responses)', icon: 'fa-book', tag: 'beta', component: ReferenceTable },
    { key: 'song-of-the-day', title: 'Song of the Day', description: 'Daily song suggestions and tracking', icon: 'fa-music', tag: 'soon', component: ComingSoon, props: { feature: 'Song of the Day' } },
    { key: 'message-of-the-day', title: 'Message of the Day', description: 'Auto-published daily messages', icon: 'fa-bullhorn', tag: 'soon', component: ComingSoon, props: { feature: 'Message of the Day' } },
    { key: 'question-of-the-day', title: 'Question of the Day', description: 'Daily prompts to spark conversation', icon: 'fa-circle-question', tag: 'soon', component: ComingSoon, props: { feature: 'Question of the Day' } },
    { key: 'honeypot', title: 'Honeypot', description: 'Trap and monitor suspicious users', icon: 'fa-jar', tag: 'soon', component: ComingSoon, props: { feature: 'Honeypot' } },
    { key: 'calendar', title: 'Calendar', description: 'Event scheduling and management', icon: 'fa-calendar', tag: 'soon', component: ComingSoon, props: { feature: 'Calendar' } },
    { key: 'creator-notifications', title: 'Creator Notifications', description: 'Alerts for creator activity', icon: 'fa-bell', tag: 'soon', component: ComingSoon, props: { feature: 'Creator Notifications' } },
    { key: 'music', title: 'Music (Jukebox)', description: 'Play music in voice channels', icon: 'fa-headphones', tag: 'soon', component: ComingSoon, props: { feature: 'Music' } },
    { key: 'welcome-onboarding', title: 'Welcome & Onboarding', description: 'Custom welcome messages and onboarding flow', icon: 'fa-handshake', tag: 'soon', component: ComingSoon, props: { feature: 'Welcome & Onboarding' } },
    { key: 'offboarding', title: 'Offboarding', description: 'Handle member departures and cleanup', icon: 'fa-door-open', tag: 'soon', component: ComingSoon, props: { feature: 'Offboarding' } },
    { key: 'xp', title: 'XP', description: 'Experience points and leveling system', icon: 'fa-star', tag: 'soon', component: ComingSoon, props: { feature: 'XP' } },
    { key: 'invite-tracking', title: 'Invite Tracking', description: 'Track who invited whom', icon: 'fa-link', tag: 'soon', component: ComingSoon, props: { feature: 'Invite Tracking' } },
    { key: 'reaction-roles', title: 'Reaction Roles', description: 'Let users self-assign roles via reactions', icon: 'fa-face-smile', tag: 'soon', component: ComingSoon, props: { feature: 'Reaction Roles' } },
  ];

  // Map for quick lookup
  const paneMap = {};
  for (const p of paneDefs) paneMap[p.key] = p;

  let guildId = '';
  let guilds = [];
  let analyzeUserId = '';
  let scanKey = 0;
  let messagesUserId = '';
  let editHistoryMessageFilter = '';
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

  function onViewEdits(messageId) {
    paneCollapsed = { ...paneCollapsed, 'edit-history': false };
    saveState();
    editHistoryMessageFilter = messageId;
    setTimeout(() => {
      const el = document.querySelector('.pane-content [data-pane="edit-history"]');
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
    return { showTips: true };
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
    dashboardSettings = { showTips: true };
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

  // Re-init Sortable after the pane container appears or pane list updates
  $: if (ready && orderedPanes.length > 0) {
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
          <label for="guild-select">Select guild:</label>
          <select id="guild-select" on:change={(e) => { guildId = e.target.value; saveGuildId(e.target.value); }}>
            <option value="">-- choose a guild --</option>
            {#each guilds as g}
              <option value={g.id}>{g.name}</option>
            {/each}
          </select>
          {#if guildId}
            <span class="guild-id-display">{guildId}</span>
          {/if}
        </div>
        <input type="text" placeholder="Filter panes..." bind:value={paneSearch} class="pane-search-input" />
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
          tag={pane.tag}
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
          tag={pane.tag}
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
          tag={pane.tag}
          description={pane.description}
          forceOpen={messagesUserId ? 1 : 0}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <div data-pane="messages">
            <Messages {guildId} authorFilter={messagesUserId} on:analyzeUser={(e) => onAnalyzeUser(e.detail)} on:viewEdits={(e) => onViewEdits(e.detail)} />
          </div>
        </Card>
      {:else if pane.key === 'settings'}
        <Card
          title={pane.title}
          icon={pane.icon}
          tag={pane.tag}
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
      {:else if pane.key === 'edit-history'}
        <Card
          title={pane.title}
          icon={pane.icon}
          tag={pane.tag}
          description={dashboardSettings.showTips !== false ? pane.description : ''}
          forceOpen={editHistoryMessageFilter ? 1 : 0}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <div data-pane="edit-history">
            <EditHistory {guildId} messageFilter={editHistoryMessageFilter} />
          </div>
        </Card>
      {:else}
        <Card
          title={pane.title}
          icon={pane.icon}
          tag={pane.tag}
          description={dashboardSettings.showTips !== false ? pane.description : ''}
          collapseAll={!!paneSearch}
          collapsedState={paneCollapsed[pane.key]}
          on:collapsedStateChange={(e) => onCollapsedChange(pane.key, e.detail)}
        >
          <svelte:component this={pane.component} {guildId} {...pane.props ?? {}} />
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
  .guild-row select {
    flex: 1;
  }
  .guild-id-display {
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--text-muted);
    background: var(--background);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    white-space: nowrap;
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
    transition: opacity 0.15s, background 0.15s;
    touch-action: none;
    background: var(--surface);
    border-radius: 8px 0 0 8px;
  }
  .pane-handle:hover {
    opacity: 0.8;
    background: var(--surface-alt);
  }
  .pane-handle:active { opacity: 1; }
  .pane.sortable-ghost { opacity: 0.3; }
  .pane.sortable-ghost .pane-content { outline: 2px dashed var(--primary); outline-offset: -2px; border-radius: 8px; }
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
  }
</style>
