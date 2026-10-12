import { describe, expect, it, vi } from 'vitest';
import { watchForUpdates, type Container, type UpdateTarget } from './pwa';

class FakeWorker extends EventTarget {
	state = 'installing';
	posted: unknown[] = [];
	postMessage(m: unknown) {
		this.posted.push(m);
	}
}

const setup = (opts: { controller?: boolean; waiting?: FakeWorker | null } = {}) => {
	const listeners: Record<string, () => void> = {};
	const containerListeners: Record<string, () => void> = {};
	const reg = {
		waiting: (opts.waiting ?? null) as unknown as ServiceWorker | null,
		installing: null as unknown as ServiceWorker | null,
		addEventListener: (t: string, l: () => void) => void (listeners[t] = l),
		update: async () => {}
	} as UpdateTarget;
	const container = {
		controller: (opts.controller === false ? null : {}) as unknown as ServiceWorker | null,
		addEventListener: (t: string, l: () => void) => void (containerListeners[t] = l)
	} as Container;
	const offer = vi.fn();
	const reload = vi.fn();
	watchForUpdates(reg, container, offer, reload);
	return { reg, container, listeners, containerListeners, offer, reload };
};

const install = (s: ReturnType<typeof setup>, worker: FakeWorker) => {
	s.reg.installing = worker as unknown as ServiceWorker;
	s.listeners.updatefound!();
	worker.state = 'installed';
	worker.dispatchEvent(new Event('statechange'));
};

describe('watchForUpdates', () => {
	it('offers an update when a new worker installs while one controls the page', () => {
		const s = setup();
		install(s, new FakeWorker());
		expect(s.offer).toHaveBeenCalledOnce();
	});

	it('does not offer on the very first install (no controller yet)', () => {
		const s = setup({ controller: false });
		install(s, new FakeWorker());
		expect(s.offer).not.toHaveBeenCalled();
	});

	it('offers a worker that was already waiting when the page loaded', () => {
		const w = new FakeWorker();
		const s = setup({ waiting: w });
		expect(s.offer).toHaveBeenCalledOnce();
	});

	it('applying posts SKIP_WAITING and reloads only after the controller changes', () => {
		const w = new FakeWorker();
		const s = setup();
		install(s, w);
		s.containerListeners.controllerchange!(); // e.g. first install claiming clients
		expect(s.reload).not.toHaveBeenCalled();
		const apply = s.offer.mock.calls[0]![0] as () => void;
		apply();
		expect(w.posted).toEqual([{ type: 'SKIP_WAITING' }]);
		s.containerListeners.controllerchange!();
		expect(s.reload).toHaveBeenCalledOnce();
	});
});
