<script>
  import Card from './lib/Card.svelte'
  import BotStatus from './lib/BotStatus.svelte'
  import Say from './lib/Say.svelte'
  import ImageFilter from './lib/ImageFilter.svelte'
  import QuickReport from './lib/QuickReport.svelte'
  import FullReport from './lib/FullReport.svelte'
  import RecentReports from './lib/RecentReports.svelte'
</script>

<h1>Bot Control Panel</h1>

<Card title="Bot Status">
  <BotStatus />
</Card>

<Card title="Say">
  <Say />
</Card>

<Card title="Image Filter">
  <ImageFilter />
</Card>

<Card title="Quick Report">
  <QuickReport />
</Card>

<Card title="Full Report">
  <FullReport />
</Card>

<Card title="Recent Reports">
  <RecentReports />
</Card>
