import { createToaster } from '@skeletonlabs/skeleton-svelte';

/** App-wide toasts (update available, errors). Rendered by the root layout. */
export const toaster = createToaster({ placement: 'top-end', overlap: false });
