<script>
  export let guildId = '';

  let entries = [];
  let tag = '';
  let output = '';
  let editingTag = '';
  let editOutput = '';
  let status = '';
  const MAX_LEN = 2000;

  async function load() {
    if (!guildId) return;
    const r = await fetch(`/api/guild/${guildId}/ref-entries`);
    entries = await r.json();
  }

  async function add() {
    if (!tag.trim() || !output.trim()) return;
    status = '';
    const r = await fetch(`/api/guild/${guildId}/ref-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: tag.trim(), output: output.trim() }),
    });
    if (r.status === 409) { status = 'Tag already exists'; return; }
    if (!r.ok) { status = 'Failed to add'; return; }
    tag = '';
    output = '';
    load();
  }

  async function saveEdit() {
    if (!editOutput.trim()) return;
    status = '';
    const r = await fetch(`/api/guild/${guildId}/ref-entries/${encodeURIComponent(editingTag)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: editingTag, output: editOutput.trim() }),
    });
    if (r.status === 409) { status = 'Tag already exists'; return; }
    if (!r.ok) { status = 'Failed to update'; return; }
    editingTag = '';
    editOutput = '';
    load();
  }

  function startEdit(t, o) {
    editingTag = t;
    editOutput = o;
  }

  function cancelEdit() {
    editingTag = '';
    editOutput = '';
  }

  async function remove(t) {
    await fetch(`/api/guild/${guildId}/ref-entries/${encodeURIComponent(t)}`, { method: 'DELETE' });
    load();
  }

  $: if (guildId) { load(); }
</script>

<div class="add-row">
  <input type="text" bind:value={tag} placeholder="Tag..." />
  <button on:click={add}>Add</button>
</div>
<div class="add-output">
  <textarea bind:value={output} placeholder="Output text..." maxlength={MAX_LEN}></textarea>
  <span class="char-count">{output.length}/{MAX_LEN}</span>
</div>
{#if status}
  <p class="status">{status}</p>
{/if}

<div class="table-scroll">
  {#if entries.length === 0}
    <p style="color:var(--text-muted)">No reference entries.</p>
  {:else}
    <table class="responsive-table">
      <thead><tr><th>Tag</th><th>Output</th><th></th></tr></thead>
      <tbody>
        {#each entries as e}
          {#if editingTag === e.tag}
            <tr>
              <td class="mono-cell">{e.tag}</td>
              <td>
                <div class="add-output">
                  <textarea bind:value={editOutput} maxlength={MAX_LEN}></textarea>
                  <span class="char-count">{editOutput.length}/{MAX_LEN}</span>
                </div>
              </td>
              <td class="nowrap">
                <button class="btn-sm" on:click={saveEdit}>Save</button>
                <button class="btn-sm" on:click={cancelEdit}>Cancel</button>
              </td>
            </tr>
          {:else}
            <tr>
              <td class="mono-cell">{e.tag}</td>
              <td class="output-cell">{e.output}</td>
              <td class="nowrap">
                <button class="btn-sm" on:click={() => startEdit(e.tag, e.output)}>Edit</button>
                <button class="btn-sm btn-danger" on:click={() => remove(e.tag)}>Delete</button>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .add-row input, .add-row textarea { margin-top: 0; flex: 1; }
  .add-output { display: flex; flex-direction: column; }
  .add-output textarea { width: 100%; min-height: 80px; resize: vertical; }
  .char-count { font-size: 0.65rem; color: var(--text-muted); text-align: right; margin-top: 2px; }
  .table-scroll { margin-top: 1rem; max-height: 50vh; }
  .responsive-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .responsive-table th { position: sticky; top: 0; background: var(--surface-alt); text-align: left; padding: 0.5rem 0.75rem; white-space: nowrap; color: var(--text); }
  .responsive-table td { padding: 0.4rem 0.75rem; border-top: 1px solid var(--surface-alt); }
  .responsive-table tr:hover td { background: var(--surface-alt); }
  .mono-cell { font-family: monospace; font-size: 0.75rem; white-space: nowrap; }
  .output-cell { word-break: break-word; white-space: pre-wrap; max-width: 500px; }
  .nowrap { white-space: nowrap; }
  .status { color: var(--danger); font-size: 0.8rem; margin-top: 0.25rem; }
  @media (max-width: 640px) {
    .responsive-table { font-size: 0.7rem; }
    .responsive-table th,
    .responsive-table td { padding: 0.3rem 0.4rem; }
  }
</style>
