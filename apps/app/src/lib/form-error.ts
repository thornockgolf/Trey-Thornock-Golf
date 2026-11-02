import { tick } from 'svelte';
import { toaster } from '#lib/toaster';

/**
 * Makes a form error impossible to miss: a toast (the fixed bottom nav and the keyboard can hide the inline
 * message on a phone), then the inline message is scrolled to the middle of the screen and focused (read out by
 * screen readers). Call after the message has been set; `el` is read after the DOM updates.
 */
export const surfaceError = async (getEl: () => HTMLElement | null | undefined, title: string, message: string) => {
	toaster.error({ title, description: message });
	await tick();
	const el = getEl();
	if (!el) return;
	el.focus({ preventScroll: true });
	el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
};
