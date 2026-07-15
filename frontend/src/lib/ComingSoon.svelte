<script>
  export let feature = '';
</script>

<div class="coming-soon">
  <i class="fa-solid fa-clock"></i>
  <span>{feature} — coming soon</span>
</div>

<style>
  .coming-soon {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    padding: 1rem 0;
    opacity: 0.6;
  }
  .coming-soon i {
    font-size: 1.1rem;
  }
</style>
