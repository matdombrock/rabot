<script>
  import { onMount } from 'svelte';
  import ReportPanel from './ReportPanel.svelte';
</script>

<ReportPanel prefix="full" endpoint="user-report" autoRun={false} showSearch={false} />
