/**
 * Runes store for the upload panel: one Uppy instance (inside `UploadController`) and its state.
 * The logic lives in plain modules (`upload-logic.ts`, `upload-controller.ts`, `video-uploader.ts`)
 * so it is tested without a browser; this file only makes it reactive.
 */
import { browserTransport, type Transport } from './transport';
import { UploadController, type ControllerOptions } from './upload-controller';
import { canRetry, isBusy, type UploadState } from './upload-logic';

export interface UploadStoreOptions extends Partial<Omit<ControllerOptions, 'transport'>> {
	transport?: Transport;
	/** API base for the default transport (`/api`; dev previews use a mock). */
	apiBase?: string;
}

export class UploadStore {
	state = $state<UploadState>({ kind: 'idle' });
	title = $state('');
	online = $state(true);

	readonly busy = $derived(isBusy(this.state));
	readonly canRetry = $derived(canRetry(this.state));

	#c: UploadController;
	#unsubscribe: () => void;

	constructor(opts: UploadStoreOptions = {}) {
		const { transport, apiBase, ...rest } = opts;
		this.#c = new UploadController({ ...rest, transport: transport ?? browserTransport(apiBase) });
		this.#unsubscribe = this.#c.subscribe((s) => (this.state = s));
	}

	get videoId() {
		return this.#c.videoId;
	}

	pick = (file: File) => this.#c.pick(file);
	start = () => {
		this.#c.title = this.title;
		this.#c.start();
	};
	pause = () => this.#c.pause('user');
	resume = () => this.#c.resume();
	retry = () => this.#c.retry();
	startOver = () => this.#c.startOver();
	cancel = () => this.#c.cancel();
	reset = () => {
		this.title = '';
		this.#c.cancel();
	};
	setOnline = (online: boolean) => {
		this.online = online;
		this.#c.setOnline(online);
	};
	destroy = () => {
		this.#unsubscribe();
		this.#c.destroy();
	};
}
