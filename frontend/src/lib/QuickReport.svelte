<script>
  import ReportPanel from './ReportPanel.svelte';
  export let guildId = '';
</script>

<ReportPanel {guildId} endpoint="quick-report" showSearch={true} autoRun={true} />
