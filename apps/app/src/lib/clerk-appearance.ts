/**
 * Clerk `appearance` shared by every Clerk surface: <SignIn>, <SignUp>, the Manage account
 * modal (`clerk.openUserProfile()`) and anything else Clerk renders. Applied once, on
 * <ClerkProvider> in `routes/+layout.svelte`. Source of truth for the values is the Skeleton
 * theme in packages/ui (docs/style-guide.md, "Auth screens"); this file only maps Clerk's
 * variable names onto those CSS custom properties (the few things Clerk's own styles win over,
 * input edges and the button sheen, are forced in `clerk.css`), so a theme change flows through and dark
 * mode (OS-driven, `light-dark()`) needs no second palette.
 */

/** A theme token as a CSS value. Clerk resolves these in the page, where the theme is defined. */
const token = (name: string) => `var(--${name})`;
/** Light/dark pair of two tokens (style-guide 16.2). */
const pair = (light: string, dark: string) => `light-dark(var(--${light}), var(--${dark}))`;

export const clerkVariables = {
	colorPrimary: pair('color-primary-500', 'color-primary-400'),
	colorPrimaryForeground: '#ffffff',
	colorBackground: pair('color-surface-50', 'color-surface-900'),
	colorForeground: pair('color-surface-700', 'color-surface-100'),
	colorMutedForeground: pair('color-surface-600', 'color-surface-300'),
	colorMuted: pair('color-surface-100', 'color-surface-800'),
	colorInput: pair('color-surface-50', 'color-surface-950'),
	colorInputForeground: pair('color-surface-800', 'color-surface-50'),
	colorBorder: pair('color-surface-300', 'color-surface-700'),
	colorNeutral: pair('color-surface-900', 'color-surface-50'),
	colorDanger: pair('color-error-700', 'color-error-300'),
	colorSuccess: pair('color-success-700', 'color-success-300'),
	colorWarning: pair('color-warning-700', 'color-warning-300'),
	colorModalBackdrop: 'color-mix(in srgb, var(--color-secondary-950) 65%, transparent)',
	colorRing: pair('color-secondary-500', 'color-tertiary-400'),
	fontFamily: token('typo-base--font-family'),
	fontFamilyButtons: token('typo-heading--font-family'),
	borderRadius: token('radius-base'),
	fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 }
} as const;

/** Control edge: surface-500 on light (3.5:1 on white) and surface-400 on dark. */
const edge = pair('color-surface-500', 'color-surface-400');
const display = token('typo-heading--font-family');

export const clerkElements = {
	// Card sits on the page like our other raised surfaces
	// No width/maxWidth here: the Manage account window sizes itself (55rem card) and a width set on
	// rootBox/cardBox squeezed it to ~400px. Sign-in/sign-up widths live in `clerkCardAppearance`.
	cardBox: { borderRadius: token('radius-container'), boxShadow: 'none', border: `1px solid ${pair('color-surface-200', 'color-surface-700')}` },
	card: { boxShadow: 'none' },
	headerTitle: { fontFamily: display, fontWeight: 700, color: pair('color-secondary-500', 'color-secondary-100') },
	// Pill buttons in Poppins, 48px tall (style-guide 11.2)
	formButtonPrimary: { backgroundImage: 'none', boxShadow: 'none', borderRadius: '9999px', fontFamily: display, fontWeight: 600, minHeight: '3rem', textTransform: 'none' },
	socialButtonsBlockButton: { boxShadow: 'none', border: `1px solid ${edge}`, color: pair('color-surface-800', 'color-surface-50'), borderRadius: '9999px', minHeight: '3rem', fontFamily: display, fontWeight: 600 },
	// Clerk derives hairlines at ~10% alpha, too faint for a 3:1 control edge; set them explicitly
	formFieldInput: { minHeight: '3rem', fontSize: '1rem', boxShadow: 'none', border: `1px solid ${edge}` },
	socialButtonsBlockButton__google: { boxShadow: 'none', border: `1px solid ${edge}` },
	formFieldLabel: { color: pair('color-surface-800', 'color-surface-100'), fontWeight: 600 },
	dividerLine: { backgroundColor: pair('color-surface-300', 'color-surface-700') },
	dividerText: { color: pair('color-surface-600', 'color-surface-300') },
	footerActionText: { color: pair('color-surface-600', 'color-surface-300') },
	footerActionLink: { color: pair('color-primary-500', 'color-primary-300'), fontWeight: 600 },
} as const;

const clerkLayout = { socialButtonsPlacement: 'top', socialButtonsVariant: 'blockButton', logoPlacement: 'none', shimmer: false } as const;

export const clerkAppearance = {
	variables: clerkVariables,
	elements: clerkElements,
	layout: clerkLayout
} as const;

/** The page already shows a heading and intro above the card, so the sign-in and sign-up cards drop their own header. */
export const clerkCardAppearance = {
	...clerkAppearance,
	elements: {
		...clerkElements,
		rootBox: { width: '100%', maxWidth: '28rem' },
		cardBox: { ...clerkElements.cardBox, width: '100%', maxWidth: '100%' },
		header: { display: 'none' }
	}
} as const;

/** Element keys the Manage account (UserProfile) styling in `clerk.css` targets as `.cl-<key>`; each exists in @clerk/ui 1.42 `APPEARANCE_KEYS`. */
export const profileClasses = [
	'modalBackdrop', 'modalContent', 'modalCloseButton', 'cardBox', 'card', 'navbar', 'navbarButtons', 'navbarButton', 'navbarButtonIcon', 'navbarButtonText',
	'navbarMobileMenuRow', 'navbarMobileMenuButton', 'scrollBox', 'pageScrollBox', 'page', 'profilePage', 'profilePageContent', 'header', 'headerTitle', 'headerSubtitle',
	'profileSection', 'profileSectionHeader', 'profileSectionTitleText', 'profileSectionSubtitleText', 'profileSectionContent', 'profileSectionItem', 'profileSectionItemList',
	'profileSectionPrimaryButton', 'profileSectionButtonGroup', 'userPreviewMainIdentifier', 'userPreviewSecondaryIdentifier', 'activeDevice', 'activeDeviceListItem', 'activeDeviceIcon',
	'badge', 'menuButton', 'menuList', 'menuItem', 'actionCard', 'formButtonReset', 'formFieldInput', 'formFieldLabel', 'formFieldErrorText', 'alert', 'avatarImageActionsUpload',
	'tableHead', 'button', 'footer', 'footerAction'
] as const;

/** Clerk's class for an element key (`cl-` prefix, from `customizables/elementDescriptors`). */
export const clerkClass = (key: string) => `cl-${key}`;
