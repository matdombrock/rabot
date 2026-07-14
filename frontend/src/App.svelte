<script>
  import { onMount } from 'svelte'
  import Card from './lib/Card.svelte'
  import BotStatus from './lib/BotStatus.svelte'
  import Say from './lib/Say.svelte'
  import ImageFilter from './lib/ImageFilter.svelte'
  import TextFilter from './lib/TextFilter.svelte'
  import QuickReport from './lib/QuickReport.svelte'
  import FullReport from './lib/FullReport.svelte'
  import RecentReports from './lib/RecentReports.svelte'
  import Messages from './lib/Messages.svelte'

  let guildId = '';
  let guilds = [];
  let analyzeUserId = '';

  function onAnalyzeUser(id) {
    analyzeUserId = id;
  }

  onMount(async () => {
    const r = await fetch('/api/guilds');
    guilds = await r.json();
  });

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
    <select id="guild-select" on:change={(e) => guildId = e.target.value}>
      <option value="">-- choose a guild --</option>
      {#each guilds as g}
        <option value={g.id}>{g.name}</option>
      {/each}
    </select>
  </div>
</div>

<Card title="Bot Status">
  <BotStatus />
</Card>

<Card title="User List" expanded={!!analyzeUserId}>
  <QuickReport {guildId} {analyzeUserId} />
</Card>

<Card title="Say">
  <Say {guildId} />
</Card>

<Card title="Image Filter">
  <ImageFilter {guildId} />
</Card>

<Card title="Text Filter">
  <TextFilter {guildId} />
</Card>

<Card title="Full Report">
  <FullReport {guildId} />
</Card>

<Card title="Recent Reports">
  <RecentReports {guildId} />
</Card>

<Card title="Messages">
  <Messages {guildId} on:analyzeUser={(e) => onAnalyzeUser(e.detail)} />
</Card>

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
  }
  .guild-name {
    color: var(--text-bright);
    font-size: 0.95rem;
  }
</style>
