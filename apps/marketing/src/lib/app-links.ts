import { PUBLIC_APP_URL, PUBLIC_SHOW_APP_LINKS } from '$app/env/public';
import { siteConfig } from '@ttg/shared';

/** Sign In / Get Started render only when the app is live (spec 3.A.4). */
export const appLinks =
	PUBLIC_SHOW_APP_LINKS && PUBLIC_APP_URL
		? {
				signIn: new URL(siteConfig.appPaths.signIn, PUBLIC_APP_URL).href,
				signUp: new URL(siteConfig.appPaths.signUp, PUBLIC_APP_URL).href
			}
		: null;
