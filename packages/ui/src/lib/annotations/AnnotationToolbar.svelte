<script lang="ts">
	import { ANNOTATION_COLORS, type AnnotationColor, type AnnotationTool } from '@ttg/shared';
	import Angle from '@lucide/svelte/icons/angle';
	import Circle from '@lucide/svelte/icons/circle';
	import Minus from '@lucide/svelte/icons/minus';
	import MoveUpRight from '@lucide/svelte/icons/move-up-right';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Redo2 from '@lucide/svelte/icons/redo-2';
	import Eraser from '@lucide/svelte/icons/eraser';
	import Type from '@lucide/svelte/icons/type';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import type { Component } from 'svelte';
	import { SHOW_FOR_OPTIONS } from './annotation-logic';

	interface Props {
		/** The chosen tool; picking it again turns drawing off (then taps play and pause the video). */
		tool: AnnotationTool | null;
		color: AnnotationColor;
		/** How long new drawings stay on screen, in ms; null = until the end. */
		showFor: number | null;
		canUndo: boolean;
		canRedo: boolean;
		draftCount: number;
		saving?: boolean;
		onUndo: () => void;
		onRedo: () => void;
		onClear: () => void;
		onSave: () => void;
	}
	let { tool = $bindable(), color = $bindable(), showFor = $bindable(), canUndo, canRedo, draftCount, saving = false, onUndo, onRedo, onClear, onSave }: Props = $props();

	const TOOLS: { id: AnnotationTool; label: string; icon: Component<{ class?: string; strokeWidth?: number; 'aria-hidden'?: 'true' }> }[] = [
		{ id: 'line', label: 'Line', icon: Minus },
		{ id: 'arrow', label: 'Arrow', icon: MoveUpRight },
		{ id: 'circle', label: 'Circle', icon: Circle },
		{ id: 'angle', label: 'Angle', icon: Angle },
		{ id: 'freehand', label: 'Freehand', icon: Pencil },
		{ id: 'text', label: 'Text', icon: Type }
	];
	const COLOR_NAME: Record<AnnotationColor, string> = {
		'#D4A017': 'Gold',
		'#FFFFFF': 'White',
		'#B3261E': 'Red',
		'#0E2B5C': 'Navy',
		'#D9EFA5': 'Lime'
	};
	const HINT: Record<AnnotationTool, string> = {
		line: 'Drag on the video to draw a line.',
		arrow: 'Drag on the video to draw an arrow.',
		circle: 'Drag out from the centre to draw a circle.',
		angle: 'Tap the end of the first arm, then the corner, then the end of the second arm.',
		freehand: 'Draw with your finger or mouse.',
		text: 'Tap where the text goes, type, then press Enter.'
	};
</script>

<div class="flex flex-col gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-3" role="toolbar" aria-label="Annotation tools">
	<div class="flex flex-wrap items-center gap-2">
		<div class="flex flex-wrap gap-1" role="group" aria-label="Drawing tool">
			{#each TOOLS as t (t.id)}
				<button
					type="button"
					class="btn-icon size-12 {tool === t.id ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}"
					aria-pressed={tool === t.id}
					aria-label={t.label}
					title={t.label}
					onclick={() => (tool = tool === t.id ? null : t.id)}
				>
					<t.icon class="size-5" strokeWidth={1.8} aria-hidden="true" />
				</button>
			{/each}
		</div>

		<span class="mx-1 hidden h-8 w-px bg-surface-300-700 sm:block" aria-hidden="true"></span>

		<div class="flex flex-wrap gap-1" role="group" aria-label="Colour">
			{#each ANNOTATION_COLORS as c (c)}
				<button
					type="button"
					class="relative flex size-11 items-center justify-center rounded-full"
					aria-pressed={color === c}
					aria-label={COLOR_NAME[c]}
					title={COLOR_NAME[c]}
					onclick={() => (color = c)}
				>
					<span
						class="size-7 rounded-full border-2 {color === c ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-100-900' : ''}"
						style:background={c}
						style:border-color={c === '#FFFFFF' || c === '#D9EFA5' ? 'rgba(0,0,0,0.35)' : c === '#0E2B5C' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.25)'}
					></span>
				</button>
			{/each}
		</div>

		<span class="mx-1 hidden h-8 w-px bg-surface-300-700 sm:block" aria-hidden="true"></span>

		<div class="flex gap-1" role="group" aria-label="History">
			<button type="button" class="btn-icon size-12 preset-outlined-surface-300-700" disabled={!canUndo} aria-label="Undo" title="Undo" onclick={onUndo}>
				<Undo2 class="size-5" strokeWidth={1.8} aria-hidden="true" />
			</button>
			<button type="button" class="btn-icon size-12 preset-outlined-surface-300-700" disabled={!canRedo} aria-label="Redo" title="Redo" onclick={onRedo}>
				<Redo2 class="size-5" strokeWidth={1.8} aria-hidden="true" />
			</button>
			<button type="button" class="btn-icon size-12 preset-outlined-surface-300-700" disabled={draftCount === 0} aria-label="Clear drawings" title="Clear drawings" onclick={onClear}>
				<Eraser class="size-5" strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<label class="flex items-center gap-2 text-sm">
			<span class="text-surface-600-400">Show for</span>
			<select class="select min-h-11 w-auto" value={showFor === null ? 'end' : String(showFor)} onchange={(e) => (showFor = e.currentTarget.value === 'end' ? null : Number(e.currentTarget.value))}>
				{#each SHOW_FOR_OPTIONS as o (o.label)}
					<option value={o.ms === null ? 'end' : String(o.ms)}>{o.label}</option>
				{/each}
			</select>
		</label>
		<button type="button" class="btn min-h-12 preset-filled-tertiary-500" disabled={draftCount === 0 || saving} onclick={onSave}>
			{saving ? 'Saving…' : draftCount > 1 ? `Save ${draftCount} drawings` : 'Save drawing'}
		</button>
	</div>

	<p class="text-sm text-surface-600-400" role="status">
		{tool ? HINT[tool] : 'Pick a tool to draw on the paused video. Drawings appear at the time you draw them.'}
	</p>
</div>
