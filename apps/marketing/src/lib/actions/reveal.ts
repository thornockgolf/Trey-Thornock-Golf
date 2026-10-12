import type { Action } from 'svelte/action';

/** Fade/slide an element in once when it scrolls into view. Respects prefers-reduced-motion. */
export const reveal: Action<HTMLElement> = (node) => {
	node.classList.add('reveal');
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduce || typeof IntersectionObserver === 'undefined') {
		node.classList.add('in');
		return;
	}
	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					entry.target.classList.add('in');
					io.unobserve(entry.target);
				}
			}
		},
		{ threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
	);
	io.observe(node);
	return { destroy: () => io.disconnect() };
};
