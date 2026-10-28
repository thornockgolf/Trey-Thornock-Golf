import type { NavItem } from '#lib/nav';

/** TEMPORARY dev tool (docs/system/feedback.md): the Feedback destination, appended to the sidebar and rail for both roles. */
export const feedbackNavItem = (href = '/feedback'): NavItem => ({ label: 'Feedback', href, icon: 'feedback', enabled: true, needsNetwork: true });
