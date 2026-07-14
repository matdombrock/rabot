<script>
  import ReportPanel from './ReportPanel.svelte';
  export let guildId = '';
</script>

<ReportPanel {guildId} endpoint="user-report" showSearch={false} />
