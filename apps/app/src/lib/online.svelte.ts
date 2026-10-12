/** Reactive network status. Server renders as online; the browser corrects it on mount. */
class Online {
	current = $state(true);

	/** Call once in the browser (root layout). Returns a cleanup function. */
	start() {
		this.current = navigator.onLine;
		const up = () => (this.current = true);
		const down = () => (this.current = false);
		addEventListener('online', up);
		addEventListener('offline', down);
		return () => {
			removeEventListener('online', up);
			removeEventListener('offline', down);
		};
	}
}

export const online = new Online();
