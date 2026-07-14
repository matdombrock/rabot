<script>
  import { onMount, tick } from 'svelte';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  export let guildId = '';

  let loading = false;
  let error = '';
  let data = null;
  let chartInstances = [];

  // Controls
  let rangeDays = 90;
  let interval = 'day';

  const rangeOptions = [
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
    { value: 365, label: '1 year' },
    { value: 730, label: '2 years' },
  ];

  const intervalOptions = [
    { value: 'day', label: 'Daily' },
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' },
  ];

  // Reload when guild or controls change
  $: if (guildId && rangeDays) {
    load();
  }

  // Re-render charts whenever data changes
  $: if (data) {
    tick().then(() => {
      renderCharts();
    });
  }

  async function load() {
    if (!guildId) { data = null; return; }
    loading = true;
    error = '';
    data = null;
    destroyCharts();
    try {
      const r = await fetch(`/api/guild/${guildId}/analytics?range=${rangeDays}&interval=${interval}`);
      if (!r.ok) throw new Error(await r.text());
      data = await r.json();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Reload when controls change
  $: if (guildId && (rangeDays || interval)) load();

  function renderCharts() {
    destroyCharts();

    if (!data) return;

    const msgCanvas = document.getElementById('chart-messages');
    const usersCanvas = document.getElementById('chart-users');

    // If canvases are not in DOM yet, retry
    if (!msgCanvas || !usersCanvas) {
      setTimeout(() => renderCharts(), 100);
      return;
    }

    // If canvases are hidden (card collapsed), retry periodically
    if (msgCanvas.offsetParent === null || msgCanvas.offsetHeight === 0) {
      setTimeout(() => renderCharts(), 200);
      return;
    }

    // Messages by day chart
    if (data.messagesByDay.length > 0) {
      const ch = new Chart(msgCanvas, {
        type: 'bar',
        data: {
          labels: data.messagesByDay.map(d => d.day),
          datasets: [{
            label: 'Messages',
            data: data.messagesByDay.map(d => d.count),
            backgroundColor: '#B450FF44',
            borderColor: '#B450FF',
            borderWidth: 1,
            borderRadius: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#261E36',
              titleColor: '#DCC8FF',
              bodyColor: '#DCC8FF',
              borderColor: '#382C4C',
              borderWidth: 1,
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#8C78B4',
                maxTicksLimit: 12,
                maxRotation: 45,
              },
              grid: { color: '#382C4C44' }
            },
            y: {
              ticks: {
                color: '#8C78B4',
                precision: 0,
              },
              grid: { color: '#382C4C44' },
              beginAtZero: true,
            }
          }
        }
      });
      chartInstances.push(ch);
    }

    // New users by day chart
    if (usersCanvas && data.newUsersByDay.length > 0) {
      const ch = new Chart(usersCanvas, {
        type: 'bar',
        data: {
          labels: data.newUsersByDay.map(d => d.day),
          datasets: [{
            label: 'New Users',
            data: data.newUsersByDay.map(d => d.count),
            backgroundColor: '#8C78B444',
            borderColor: '#8C78B4',
            borderWidth: 1,
            borderRadius: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#261E36',
              titleColor: '#DCC8FF',
              bodyColor: '#DCC8FF',
              borderColor: '#382C4C',
              borderWidth: 1,
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#8C78B4',
                maxTicksLimit: 12,
                maxRotation: 45,
              },
              grid: { color: '#382C4C44' }
            },
            y: {
              ticks: {
                color: '#8C78B4',
                precision: 0,
              },
              grid: { color: '#382C4C44' },
              beginAtZero: true,
            }
          }
        }
      });
      chartInstances.push(ch);
    }
  }

  function destroyCharts() {
    for (const ch of chartInstances) {
      ch.destroy();
    }
    chartInstances = [];
  }

  onMount(() => {
    return () => destroyCharts();
  });
</script>

{#if loading}
  <p style="color:var(--text-muted)">Loading analytics...</p>
{:else if error}
  <p style="color:var(--danger)">Error: {error}</p>
{:else if data}
  <div class="analytics">
    <div class="stat-cards">
      <div class="stat-card">
        <span class="stat-value">{data.totalUsers.toLocaleString()}</span>
        <span class="stat-label">Total Users</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{data.totalMessages.toLocaleString()}</span>
        <span class="stat-label">Total Messages</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{data.avgDaysInServer}</span>
        <span class="stat-label">Avg Days in Server</span>
      </div>
      <div class="stat-card period">
        <span class="stat-value">{data.periodNewUsers.toLocaleString()}</span>
        <span class="stat-label">New Users ({data.rangeDays}d)</span>
      </div>
      <div class="stat-card period">
        <span class="stat-value">{data.periodMessages.toLocaleString()}</span>
        <span class="stat-label">Messages ({data.rangeDays}d)</span>
      </div>
    </div>

    <div class="controls-row">
      <div class="control-group">
        <label>Date Range</label>
        <select bind:value={rangeDays}>
          {#each rangeOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
      <div class="control-group">
        <label>Interval</label>
        <select bind:value={interval}>
          {#each intervalOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-section">
        <h3>Messages per {interval}</h3>
        <div class="chart-wrap">
          <canvas id="chart-messages"></canvas>
        </div>
      </div>

      <div class="chart-section">
        <h3>New Users per {interval}</h3>
        <div class="chart-wrap">
          <canvas id="chart-users"></canvas>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .analytics {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.5rem;
  }
  .stat-card {
    background: var(--background);
    border-radius: 6px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--primary);
    line-height: 1.2;
  }
  .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat-card.period {
    background: var(--surface-alt);
  }
  .stat-card.period .stat-value {
    color: var(--text-bright);
  }
  .controls-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }
  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .control-group label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .control-group select {
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    min-width: 120px;
  }
  .charts-row {
    display: flex;
    gap: 1rem;
    flex-direction: column;
  }
  @media (min-width: 900px) {
    .charts-row {
      flex-direction: row;
    }
    .charts-row .chart-section {
      flex: 1;
      min-width: 0;
    }
  }
  .chart-section h3 {
    font-size: 0.9rem;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
    font-weight: 500;
  }
  .chart-wrap {
    background: var(--background);
    border-radius: 6px;
    padding: 0.5rem;
    height: 200px;
    position: relative;
  }
  .chart-wrap canvas {
    width: 100% !important;
    height: 100% !important;
  }
</style>
