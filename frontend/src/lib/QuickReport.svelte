<script>
  import { onMount } from 'svelte';
  import ReportPanel from './ReportPanel.svelte';
</script>

<ReportPanel prefix="quick" endpoint="quick-report" autoRun={true} showSearch={true} />
