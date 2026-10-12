<script lang="ts">
	import type { AnnotationColor, AnnotationPoint, AnnotationShape, AnnotationTool } from '@ttg/shared';
	import type * as Fabric from 'fabric';
	import { onMount, untrack } from 'svelte';
	import { DEFAULT_STROKE, DEFAULT_TEXT_SIZE, DrawSession, containRect, toNormalized } from './annotation-logic';
	import { shapeToFabric } from './annotation-render';

	interface Props {
		/** The video's width / height. The canvas is the picture's rectangle, not the (letterboxed) box around it. */
		aspect: number;
		/** Shapes to show now (the caller filters by playhead time). */
		shapes: readonly AnnotationShape[];
		/** Drawing tool. `null` makes the layer display-only and lets taps through to the player. */
		tool?: AnnotationTool | null;
		color?: AnnotationColor;
		/** A finished shape from the pointer. */
		onDraw?: (shape: AnnotationShape) => void;
		/** The pointer went down to start drawing (pause the video here). */
		onBeginDraw?: () => void;
	}
	let { aspect, shapes, tool = null, color = '#D4A017', onDraw, onBeginDraw }: Props = $props();

	let box: HTMLDivElement;
	let host = $state<HTMLDivElement>();
	let canvasEl = $state<HTMLCanvasElement>();
	let fabric = $state<typeof Fabric>();
	let canvas: Fabric.StaticCanvas | undefined;
	let boxSize = $state({ w: 0, h: 0 });

	const rect = $derived(containRect(boxSize, aspect));

	let session: DrawSession | undefined;
	let preview = $state<AnnotationShape>();
	let textAt = $state<AnnotationPoint>();
	let textValue = $state('');

	onMount(() => {
		const ro = new ResizeObserver(([entry]) => {
			const r = entry!.contentRect;
			boxSize = { w: r.width, h: r.height };
		});
		ro.observe(box);
		// fabric touches `window` on import, so load it in the browser only
		void import('fabric').then((m) => (fabric = m));
		return () => {
			ro.disconnect();
			canvas?.dispose();
			canvas = undefined;
		};
	});

	// create the Fabric canvas once both the element and the module exist
	$effect(() => {
		if (!fabric || !canvasEl || canvas) return;
		canvas = new fabric.StaticCanvas(canvasEl, { renderOnAddRemove: false, enableRetinaScaling: true });
	});

	// redraw whenever the shapes, the preview or the size change
	$effect(() => {
		const f = fabric;
		const c = canvas;
		const w = Math.round(rect.w);
		const h = Math.round(rect.h);
		const list = preview ? [...shapes, preview] : shapes;
		if (!f || !c || w <= 0 || h <= 0) return;
		c.setDimensions({ width: w, height: h });
		c.clear();
		for (const s of list) for (const o of shapeToFabric(f, s, w, h)) c.add(o);
		c.requestRenderAll();
	});

	// a new tool or colour starts a fresh gesture
	$effect(() => {
		const t = tool;
		const col = color;
		const a = aspect;
		untrack(() => {
			session = t ? new DrawSession(t, col, a) : undefined;
			preview = undefined;
			textAt = undefined;
		});
	});

	const point = (e: PointerEvent) => toNormalized(e.clientX, e.clientY, (e.currentTarget as HTMLElement).getBoundingClientRect());

	const down = (e: PointerEvent) => {
		if (!session || (e.pointerType === 'mouse' && e.button !== 0)) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		onBeginDraw?.();
		if (textAt) commitText();
		session.press(point(e));
	};
	const moveEv = (e: PointerEvent) => {
		if (!session) return;
		session.move(point(e));
		preview = session.preview();
	};
	const up = (e: PointerEvent) => {
		if (!session) return;
		const p = point(e);
		if (tool === 'text') {
			textAt = p;
			textValue = '';
			return;
		}
		const shape = session.release(p);
		preview = session.preview();
		if (shape) onDraw?.(shape);
	};
	const cancel = () => {
		session?.cancel();
		preview = undefined;
		textAt = undefined;
	};

	const commitText = () => {
		const text = textValue.trim();
		const at = textAt;
		textAt = undefined;
		textValue = '';
		if (!text || !at) return;
		onDraw?.({ v: 1, type: 'text', color, width: DEFAULT_STROKE, at, text, size: DEFAULT_TEXT_SIZE });
	};

	const focusOnMount = (el: HTMLInputElement) => el.focus();
</script>

<!-- the overlay never leaves the picture; only the capture layer takes pointer input, and only while a tool is chosen -->
<div bind:this={box} class="pointer-events-none absolute inset-0" data-annotation-box>
	<div
		bind:this={host}
		class="absolute"
		style:left="{rect.x}px"
		style:top="{rect.y}px"
		style:width="{rect.w}px"
		style:height="{rect.h}px"
		data-annotation-frame
	>
		<canvas bind:this={canvasEl} class="absolute inset-0" aria-hidden="true"></canvas>

		{#if tool}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
				data-annotation-capture
				onpointerdown={down}
				onpointermove={moveEv}
				onpointerup={up}
				onpointercancel={cancel}
				onkeydown={(e) => e.key === 'Escape' && cancel()}
			></div>
		{/if}

		{#if textAt}
			<input
				use:focusOnMount
				type="text"
				class="pointer-events-auto absolute z-10 min-h-9 w-44 max-w-[80%] rounded-base border border-white/60 bg-black/70 px-2 text-base text-white"
				style:left="{Math.min(textAt.x, 0.7) * 100}%"
				style:top="{Math.min(textAt.y, 0.9) * 100}%"
				maxlength="200"
				placeholder="Type, then Enter"
				aria-label="Annotation text"
				bind:value={textValue}
				onkeydown={(e) => {
					e.stopPropagation();
					if (e.key === 'Enter') commitText();
					if (e.key === 'Escape') cancel();
				}}
				onblur={commitText}
			/>
		{/if}
	</div>
</div>
