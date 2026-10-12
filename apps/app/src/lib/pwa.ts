/**
 * Offer a service-worker update to the user instead of swapping code under them. When a new
 * worker finishes installing while an old one controls the page, `offer(apply)` is called;
 * `apply()` tells the new worker to take over and the page reloads once it has.
 */
export interface UpdateTarget {
	waiting: ServiceWorker | null;
	installing: ServiceWorker | null;
	addEventListener(type: 'updatefound', listener: () => void): void;
	update(): Promise<unknown>;
}
export interface Container {
	controller: ServiceWorker | null;
	addEventListener(type: 'controllerchange', listener: () => void): void;
}

export const watchForUpdates = (
	registration: UpdateTarget,
	container: Container,
	offer: (apply: () => void) => void,
	reload: () => void = () => location.reload()
) => {
	let applying = false;
	const make = (worker: ServiceWorker) => () => {
		applying = true;
		worker.postMessage({ type: 'SKIP_WAITING' });
	};
	// Only reload when the user asked for it; the very first install also fires controllerchange.
	container.addEventListener('controllerchange', () => {
		if (applying) reload();
	});
	if (registration.waiting && container.controller) offer(make(registration.waiting));
	registration.addEventListener('updatefound', () => {
		const worker = registration.installing;
		if (!worker) return;
		worker.addEventListener('statechange', () => {
			if (worker.state === 'installed' && container.controller) offer(make(worker));
		});
	});
};

/** Browser entry: register-time wiring plus an hourly and on-focus check for a new deploy. */
export const startUpdateWatcher = async (offer: (apply: () => void) => void) => {
	if (!('serviceWorker' in navigator)) return;
	const registration = await navigator.serviceWorker.ready;
	watchForUpdates(registration, navigator.serviceWorker, offer);
	const check = () => void registration.update().catch(() => {});
	setInterval(check, 60 * 60 * 1000);
	document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
};
