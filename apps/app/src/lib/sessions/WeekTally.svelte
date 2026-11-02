<script lang="ts">
	import { formatTally, weekTally, type LoggedSessionDto, type PlanSessionDto } from '@ttg/shared';

	/** "This week: 3 planned (2 done), 1 extra". Planned sessions and logged extras are counted apart. */
	let { planned, logged, today }: { planned: readonly PlanSessionDto[]; logged: readonly LoggedSessionDto[]; today: string } = $props();
</script>

<p class="text-sm text-surface-700-300" data-week-tally><span class="font-semibold">This week:</span> {formatTally(weekTally(planned, logged, today))}</p>
