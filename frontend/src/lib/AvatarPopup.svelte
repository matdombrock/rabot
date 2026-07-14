<script>
  import { onMount } from 'svelte';

  export let show = false;
  export let url = '';
  export let name = '';

  // Request a larger version from Discord's CDN
  $: largeUrl = url.replace(/\?size=\d+/, '?size=512');

  function close() {
    show = false;
  }

  function copyUrl() {
    navigator.clipboard.writeText(url);
  }

  function saveImage() {
    const a = document.createElement('a');
    a.href = url;
    const ext = url.includes('.gif') ? 'gif' : 'png';
    a.download = `${name || 'avatar'}.${ext}`;
    a.click();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  onMount(() => {
    if (show) {
      document.addEventListener('keydown', onKeydown);
    }
    return () => document.removeEventListener('keydown', onKeydown);
  });
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" on:click={close}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="popup" on:click|stopPropagation>
      <button class="close-btn" on:click={close}>×</button>
      <div class="avatar-wrap">
        <img src={largeUrl} alt={name} />
      </div>
      <div class="actions">
        <button class="btn-sm" on:click={copyUrl}><i class="fa-solid fa-link"></i> Copy URL</button>
        <button class="btn-sm" on:click={saveImage}><i class="fa-solid fa-download"></i> Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .popup {
    background: var(--surface);
    border-radius: 12px;
    padding: 1rem;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    position: relative;
  }
  .close-btn {
    position: absolute;
    top: 0.35rem;
    right: 0.5rem;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.3rem;
    cursor: pointer;
    line-height: 1;
    padding: 0.2rem;
  }
  .close-btn:hover { color: var(--text-bright); background: none; }
  .avatar-wrap {
    max-width: min(90vw, 512px);
    max-height: 70vh;
    overflow: hidden;
    border-radius: 8px;
  }
  .avatar-wrap img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 70vh;
    object-fit: contain;
    border-radius: 8px;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
