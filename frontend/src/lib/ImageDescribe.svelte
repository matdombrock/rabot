<script>
  export let guildId = '';

  let enabled = false;
  let loading = false;

  async function load() {
    if (!guildId) return;
    loading = true;
    try {
      const r = await fetch(`/api/guild/${guildId}/ai-image-describe`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      enabled = data.enabled;
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function toggle() {
    try {
      const r = await fetch(`/api/guild/${guildId}/ai-image-describe/toggle`, { method: 'PUT' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      enabled = data.enabled;
    } catch (err) {
      console.error(err);
    }
  }

  $: if (guildId) load();
</script>

<div class="image-describe">
  <div class="toggle-row">
    <span class="toggle-label">AI Image Describe</span>
    <label class="toggle">
      <input type="checkbox" checked={enabled} on:change={toggle} />
      <span class="toggle-slider"></span>
    </label>
    <span class="toggle-hint">{enabled ? 'Enabled — images uploaded to the server will be described by AI' : 'Disabled'}</span>
  </div>

  <div class="info-box">
    <p>When enabled, any image uploaded to the server will automatically receive an AI-generated description as a reply.</p>
  </div>
</div>

<style>
  .image-describe {
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
  .info-box {
    background: var(--background);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .info-box p { margin: 0; }
</style>
