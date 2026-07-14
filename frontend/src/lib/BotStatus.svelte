<script>
  import { onMount } from 'svelte';

  let tag = 'Loading...';
  let details = '';
  let pingResult = '';

  onMount(() => {
    loadInfo();
    const interval = setInterval(loadInfo, 10000);
    return () => clearInterval(interval);
  });

  async function loadInfo() {
    try {
      const r = await fetch('/api/info');
      if (!r.ok) throw new Error(r.statusText);
      const data = await r.json();
      tag = data.tag;
      details = `Node ${data.node} | Uptime ${formatUptime(data.uptime)} | WS ${data.wsPing}ms`;
    } catch (err) {
      tag = 'Offline';
      details = 'Error: ' + err.message;
    }
  }

  function formatUptime(ms) {
    if (ms == null) return 'N/A';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m ${s % 60}s`;
  }

  async function ping() {
    pingResult = 'Pinging...';
    const start = Date.now();
    await fetch('/api/info');
    pingResult = `Pong! ${Date.now() - start}ms`;
  }
</script>

<div class="row">
  <span>{tag}</span>
  <button on:click={ping}>Ping</button>
</div>
<div class="status">{details}</div>
<div class="status">{pingResult}</div>

<style>
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .status {
    margin-top: 0.5rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
</style>
