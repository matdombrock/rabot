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

  const rangeOptions = [
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
    { value: 365, label: '1 year' },
    { value: 730, label: '2 years' },
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
      const r = await fetch(`/api/guild/${guildId}/analytics?range=${rangeDays}`);
      if (!r.ok) throw new Error(await r.text());
      data = await r.json();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Reload when controls change
  $: if (guildId && rangeDays) load();

  function renderCharts() {
    destroyCharts();

    if (!data) return;

    const msgCanvas = document.getElementById('chart-messages');
    const usersCanvas = document.getElementById('chart-users');
    const channelCanvas = document.getElementById('chart-channels');
    const dowCanvas = document.getElementById('chart-dow');
    const topPostersCanvas = document.getElementById('chart-top-posters');
    const hourCanvas = document.getElementById('chart-hour');
    const deletedCanvas = document.getElementById('chart-deleted');
    const rolesCanvas = document.getElementById('chart-roles');

    // If canvases are not in DOM yet, retry
    if (!msgCanvas || !usersCanvas || !channelCanvas || !dowCanvas || !topPostersCanvas || !hourCanvas || !deletedCanvas || !rolesCanvas) {
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

    // Messages per channel (pie chart)
    if (data.messagesPerChannel && data.messagesPerChannel.length > 0) {
      const colors = ['#B450FF', '#8C78B4', '#6B4F9E', '#DCC8FF', '#5B2B8C', '#A070D0', '#382C4C', '#7A5FA8', '#E0D0F0', '#4A3A6A'];
      // Limit to top 10, group rest as "Other"
      let labels = [];
      let counts = [];
      let otherCount = 0;
      for (let i = 0; i < data.messagesPerChannel.length; i++) {
        if (i < 9) {
          labels.push(`#${data.messagesPerChannel[i].channelName}`);
          counts.push(data.messagesPerChannel[i].count);
        } else {
          otherCount += data.messagesPerChannel[i].count;
        }
      }
      if (otherCount > 0) {
        labels.push('Other');
        counts.push(otherCount);
      }

      const ch = new Chart(channelCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: counts,
            backgroundColor: colors.slice(0, labels.length),
            borderColor: '#141020',
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: '#8C78B4',
                font: { size: 10 },
                boxWidth: 12,
                padding: 8,
              }
            },
            tooltip: {
              backgroundColor: '#261E36',
              titleColor: '#DCC8FF',
              bodyColor: '#DCC8FF',
              borderColor: '#382C4C',
              borderWidth: 1,
              callbacks: {
                label: function(ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = Math.round(ctx.parsed * 100 / total);
                  return `${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
                }
              }
            }
          }
        }
      });
      chartInstances.push(ch);
    }

    // Messages per day of week (bar chart)
    if (data.messagesByDow && data.messagesByDow.data) {
      const ch = new Chart(dowCanvas, {
        type: 'bar',
        data: {
          labels: data.messagesByDow.labels,
          datasets: [{
            label: 'Avg Messages',
            data: data.messagesByDow.data,
            backgroundColor: ['#B450FF44', '#B450FF44', '#B450FF44', '#B450FF44', '#B450FF44', '#B450FF44', '#B450FF'],
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
              ticks: { color: '#8C78B4' },
              grid: { color: '#382C4C44' }
            },
            y: {
              ticks: { color: '#8C78B4', precision: 0 },
              grid: { color: '#382C4C44' },
              beginAtZero: true,
            }
          }
        }
      });
      chartInstances.push(ch);
    }

    // Top posters
    if (data.topPosters && data.topPosters.length > 0) {
      const ch = new Chart(topPostersCanvas, {
        type: 'bar',
        data: {
          labels: data.topPosters.map(p => p.username || 'unknown'),
          datasets: [{
            label: 'Messages',
            data: data.topPosters.map(p => p.count),
            backgroundColor: '#B450FF44',
            borderColor: '#B450FF',
            borderWidth: 1,
            borderRadius: 2,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#261E36', titleColor: '#DCC8FF', bodyColor: '#DCC8FF', borderColor: '#382C4C', borderWidth: 1 }
          },
          scales: {
            x: { ticks: { color: '#8C78B4', precision: 0 }, grid: { color: '#382C4C44' }, beginAtZero: true },
            y: { ticks: { color: '#8C78B4' }, grid: { color: '#382C4C44' } }
          }
        }
      });
      chartInstances.push(ch);
    }

    // Messages by hour
    if (data.messagesByHour && data.messagesByHour.length > 0) {
      const labels = [];
      const counts = [];
      for (let h = 0; h < 24; h++) {
        labels.push(`${h}:00`);
        const found = data.messagesByHour.find(d => d.hour === h);
        counts.push(found ? found.count : 0);
      }
      const ch = new Chart(hourCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Messages',
            data: counts,
            backgroundColor: '#8C78B444',
            borderColor: '#8C78B4',
            borderWidth: 1,
            borderRadius: 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#261E36', titleColor: '#DCC8FF', bodyColor: '#DCC8FF', borderColor: '#382C4C', borderWidth: 1 }
          },
          scales: {
            x: { ticks: { color: '#8C78B4', maxTicksLimit: 12, maxRotation: 45 }, grid: { color: '#382C4C44' } },
            y: { ticks: { color: '#8C78B4', precision: 0 }, grid: { color: '#382C4C44' }, beginAtZero: true }
          }
        }
      });
      chartInstances.push(ch);
    }

    // Deleted vs active
    if (data.deletedCount !== undefined) {
      const activeCount = data.totalMessages - data.deletedCount;
      const ch = new Chart(deletedCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Active', 'Deleted'],
          datasets: [{
            data: [activeCount, data.deletedCount],
            backgroundColor: ['#B450FF44', '#88329C'],
            borderColor: '#141020',
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#8C78B4', font: { size: 10 }, boxWidth: 12, padding: 8 }
            },
            tooltip: {
              backgroundColor: '#261E36', titleColor: '#DCC8FF', bodyColor: '#DCC8FF', borderColor: '#382C4C', borderWidth: 1,
              callbacks: {
                label: function(ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  return `${ctx.label}: ${ctx.parsed.toLocaleString()} (${Math.round(ctx.parsed * 100 / total)}%)`;
                }
              }
            }
          }
        }
      });
      chartInstances.push(ch);
    }

    // Role distribution
    if (data.roleDistribution && data.roleDistribution.length > 0) {
      const colors = ['#B450FF', '#8C78B4', '#6B4F9E', '#DCC8FF', '#5B2B8C', '#A070D0', '#382C4C', '#7A5FA8', '#E0D0F0', '#4A3A6A'];
      const ch = new Chart(rolesCanvas, {
        type: 'doughnut',
        data: {
          labels: data.roleDistribution.map(r => r.top_role),
          datasets: [{
            data: data.roleDistribution.map(r => r.count),
            backgroundColor: colors.slice(0, data.roleDistribution.length),
            borderColor: '#141020',
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#8C78B4', font: { size: 10 }, boxWidth: 12, padding: 8 }
            },
            tooltip: {
              backgroundColor: '#261E36', titleColor: '#DCC8FF', bodyColor: '#DCC8FF', borderColor: '#382C4C', borderWidth: 1,
              callbacks: {
                label: function(ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  return `${ctx.label}: ${ctx.parsed.toLocaleString()} (${Math.round(ctx.parsed * 100 / total)}%)`;
                }
              }
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
    </div>

    <div class="charts-row">
      <div class="chart-section">
        <h3>Messages per Day</h3>
        <div class="chart-wrap">
          <canvas id="chart-messages"></canvas>
        </div>
      </div>
      <div class="chart-section">
        <h3>New Users per Day</h3>
        <div class="chart-wrap">
          <canvas id="chart-users"></canvas>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-section">
        <h3>Messages per Channel</h3>
        <div class="chart-wrap">
          <canvas id="chart-channels"></canvas>
        </div>
      </div>
      <div class="chart-section">
        <h3>Messages by Day of Week (avg/week)</h3>
        <div class="chart-wrap">
          <canvas id="chart-dow"></canvas>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-section">
        <h3>Top Posters</h3>
        <div class="chart-wrap">
          <canvas id="chart-top-posters"></canvas>
        </div>
      </div>
      <div class="chart-section">
        <h3>Activity by Hour</h3>
        <div class="chart-wrap">
          <canvas id="chart-hour"></canvas>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-section">
        <h3>Deleted vs Active Messages</h3>
        <div class="chart-wrap">
          <canvas id="chart-deleted"></canvas>
        </div>
      </div>
      <div class="chart-section">
        <h3>Role Distribution</h3>
        <div class="chart-wrap">
          <canvas id="chart-roles"></canvas>
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
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  @media (min-width: 900px) {
    .charts-row {
      grid-template-columns: 1fr 1fr;
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
    height: 220px;
    position: relative;
  }
  .chart-wrap canvas {
    width: 100% !important;
    height: 100% !important;
  }
</style>
