<script>
  /**
   * Reusable user search/autocomplete component.
   *
   * Props:
   *   users     — Array of { id, username, displayName, avatarUrl }
   *   value     — Currently selected user ID (bind:value)
   *   placeholder — Input placeholder text
   *   disabled  — Disable the input
   *
   * Events:
   *   select    — Fired when a user is chosen from the dropdown { detail: { id, username, displayName, avatarUrl } }
   *   clear     — Fired when the selection is cleared
   */

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let users = [];
  export let value = '';
  export let placeholder = 'Search users...';
  export let disabled = false;

  let input = '';
  let showDropdown = false;
  // Track whether we're in the middle of typing (input is user-authored, not from value sync)
  let isTyping = false;

  // When value is set externally (e.g. parent restores a saved selection),
  // sync the input display if we're not actively typing
  $: if (value && !isTyping) {
    const user = users.find(u => u.id === value);
    if (user) {
      input = user.username + (user.displayName && user.displayName !== user.username ? ` (${user.displayName})` : '');
    }
  }

  // When value is cleared externally (e.g. parent calls clearFilters),
  // clear input only if we're not actively typing
  $: if (!value && !isTyping) {
    input = '';
  }

  $: filtered = input
    ? users.filter(u =>
        u.username.toLowerCase().includes(input.toLowerCase()) ||
        (u.displayName || '').toLowerCase().includes(input.toLowerCase())
      ).slice(0, 10)
    : [];

  function onInput() {
    isTyping = true;
    showDropdown = input.length > 0;
  }

  function onFocus() {
    if (input.length > 0) showDropdown = true;
  }

  function onBlur() {
    setTimeout(() => {
      showDropdown = false;
      isTyping = false;
      // Re-sync input from value if user blurred without selecting
      if (!value && input) input = '';
    }, 200);
  }

  function select(user) {
    isTyping = false;
    value = user.id;
    input = user.username + (user.displayName && user.displayName !== user.username ? ` (${user.displayName})` : '');
    showDropdown = false;
    dispatch('select', user);
  }

  function clear() {
    isTyping = false;
    value = '';
    input = '';
    showDropdown = false;
    dispatch('clear');
  }
</script>

<div class="user-search-box" class:has-value={!!value}>
  <i class="fa-solid fa-user search-icon"></i>
  <input
    type="text"
    {placeholder}
    bind:value={input}
    on:input={onInput}
    on:focus={onFocus}
    on:blur={onBlur}
    {disabled}
  />
  {#if value}
    <button class="clear-btn" on:click|stopPropagation={clear} title="Clear selection">×</button>
  {/if}
  {#if showDropdown && filtered.length > 0}
    <div class="dropdown">
      {#each filtered as u}
        <button class="option" on:mousedown={() => select(u)}>
          {#if u.avatarUrl}
            <img src={u.avatarUrl} alt="" class="avatar" />
          {/if}
          <span class="name">{u.username}</span>
          {#if u.displayName && u.displayName !== u.username}
            <span class="display-name">({u.displayName})</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .user-search-box {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .search-icon {
    position: absolute;
    left: 0.45rem;
    font-size: 0.7rem;
    color: var(--text-muted);
    opacity: 0.5;
    z-index: 1;
    pointer-events: none;
  }
  .user-search-box input {
    padding: 0.25rem 0.5rem 0.25rem 1.5rem;
    font-size: 0.8rem;
    min-height: unset;
    width: 150px;
    padding-right: 1.4rem;
  }
  .user-search-box.has-value input {
    padding-right: 1.8rem;
  }
  .clear-btn {
    position: absolute;
    right: 0.25rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0.1rem;
    z-index: 1;
  }
  .clear-btn:hover { color: var(--text-bright); background: none; }
  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 10;
    background: var(--surface);
    border: 1px solid var(--surface-alt);
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    min-width: 220px;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
    border: none;
    border-radius: 0;
    background: none;
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }
  .option:hover { background: var(--surface-alt); }
  .avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .name { font-weight: 500; }
  .display-name { color: var(--text-muted); }
</style>
