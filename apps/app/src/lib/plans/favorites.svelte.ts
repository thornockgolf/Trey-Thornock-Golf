import type { FavoriteKind, FavoritesDto } from '@ttg/shared';
import { toaster } from '#lib/toaster';

/**
 * The player's starred sessions and drills on `/plans`. Toggling is optimistic: the star flips at once, the request goes
 * to `PUT`/`DELETE {apiBase}/favorites/:kind/:id`, and a failure puts that one star back and shows an error toast.
 */
export class FavoritesStore {
	sessionIds = $state<string[]>([]);
	drillIds = $state<string[]>([]);
	readonly #apiBase: string;

	constructor(initial: FavoritesDto | undefined, apiBase = '/api') {
		this.#apiBase = apiBase;
		this.reset(initial);
	}

	/** Replace everything with the server's copy (after a page load). */
	reset(next: FavoritesDto | undefined) {
		this.sessionIds = [...(next?.sessionIds ?? [])];
		this.drillIds = [...(next?.drillIds ?? [])];
	}

	has(kind: FavoriteKind, id: string) {
		return (kind === 'session' ? this.sessionIds : this.drillIds).includes(id);
	}

	#apply(kind: FavoriteKind, id: string, on: boolean) {
		const list = (kind === 'session' ? this.sessionIds : this.drillIds).filter((x) => x !== id);
		if (on) list.push(id);
		if (kind === 'session') this.sessionIds = list;
		else this.drillIds = list;
	}

	async set(kind: FavoriteKind, id: string, on: boolean) {
		this.#apply(kind, id, on);
		try {
			const res = await fetch(`${this.#apiBase}/favorites/${kind}/${id}`, { method: on ? 'PUT' : 'DELETE' });
			if (!res.ok) throw new Error();
		} catch {
			this.#apply(kind, id, !on);
			toaster.error({ title: 'Could not save that favorite. Check your connection and try again.' });
		}
	}

	toggle(kind: FavoriteKind, id: string) {
		return this.set(kind, id, !this.has(kind, id));
	}
}
