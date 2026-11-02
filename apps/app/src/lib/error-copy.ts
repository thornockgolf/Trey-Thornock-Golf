/** Plain-language copy for the full-page error screen (`routes/+error.svelte`): no access, locked or closed account, missing page. */
export const errorCopy = (status: number, message?: string) => {
	if (status === 403 && message === 'This account has been closed')
		return { heading: 'This account is closed', body: 'This account is no longer active. If you think that is a mistake, contact us below.', signOut: true };
	if (status === 403) return { heading: "You don't have access to this page", body: 'This area is for coaches. Your account is signed in, but it is not allowed here.', signOut: false };
	if (status === 401) return { heading: 'Please sign in', body: 'Your session has ended. Sign in again to continue.', signOut: true };
	if (status === 404) return { heading: "We can't find that page", body: 'The link may be old or mistyped.', signOut: false };
	return { heading: 'Something went wrong', body: 'Please try again in a moment. If it keeps happening, contact us below.', signOut: false };
};
