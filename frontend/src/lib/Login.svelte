<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  let username = '';
  let password = '';
  let error = '';
  let loading = false;

  async function login() {
    error = '';
    loading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error || 'Login failed';
      } else {
        dispatch('login');
      }
    } catch {
      error = 'Connection failed';
    } finally {
      loading = false;
    }
  }

  function onKeydown(e) {
    if (e.key === 'Enter') login();
  }
</script>

<div class="login-wrapper">
  <div class="login-card">
    <div class="login-header">
      <img src="/avatar.png" alt="" class="login-logo" />
      <h1>rb-zero</h1>
    </div>
    <form on:submit|preventDefault={login}>
      <div class="login-field">
        <label for="login-user">Username</label>
        <input id="login-user" type="text" bind:value={username} on:keydown={onKeydown} autofocus disabled={loading} />
      </div>
      <div class="login-field">
        <label for="login-pass">Password</label>
        <input id="login-pass" type="password" bind:value={password} on:keydown={onKeydown} disabled={loading} />
      </div>
      {#if error}
        <div class="login-error">{error}</div>
      {/if}
      <button type="submit" class="login-btn" disabled={loading || !username || !password}>
        {loading ? 'Logging in...' : 'Log in'}
      </button>
    </form>
  </div>
</div>

<style>
  .login-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
  }
  .login-card {
    background: var(--surface);
    border-radius: 12px;
    padding: 2rem;
    width: 100%;
    max-width: 360px;
  }
  .login-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    justify-content: center;
  }
  .login-header h1 {
    margin-bottom: 0;
    font-size: 1.4rem;
  }
  .login-logo {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    object-fit: cover;
  }
  .login-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 1rem;
  }
  .login-field label {
    font-size: 0.85rem;
    color: var(--text-muted);
    font-weight: 500;
  }
  .login-field input {
    min-height: unset;
    padding: 0.6rem 0.75rem;
    font-size: 0.95rem;
  }
  .login-error {
    color: var(--danger);
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
    text-align: center;
  }
  .login-btn {
    width: 100%;
    padding: 0.65rem;
    background: var(--primary);
    border: none;
    color: var(--text-bright);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    transition: opacity 0.15s;
  }
  .login-btn:hover {
    opacity: 0.85;
    background: var(--primary);
  }
  .login-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
