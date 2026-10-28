# Trey Thornock Golf Style Guide

Visual design system for the marketing site (`apps/marketing`) and the app (`apps/app`). Both consume it from `packages/ui`, built on Skeleton UI (Svelte) and Tailwind.

Status: draft for review. Every value below was extracted from the four existing pages or from the current Skeleton docs. Values that are proposals (not present in any page) are marked **Proposed**. Decisions that need Trey's or the developer's call are collected under [Open questions](#open-questions).

## 1. Purpose and scope

- One look for the whole product: the brand of `treythornockgolf.com`, carried into the app and the PWA shells.
- Covers colors, type, spacing, radius, shadow, motion, icons, imagery, components, layout, accessibility, print, and PWA chrome.
- Does not cover copy, photography direction, or the data model.
- Source pages, in order of authority:
  1. `index.html` and `golf-lessons-durham.html` (live marketing pages, source of truth for the brand).
  2. `user-profile.html`, whose last CSS block ("Brand matched to treythornockgolf.com, September 26, 2026") overrides its earlier palette with the marketing one.
  3. `index-trey-website.html` (practice plan generator), which still uses an older palette and fonts and is the odd one out (see section 3).

### Important correction: the palette is green, navy and gold, not navy and lime

`CLAUDE.md` and `docs/app_spec.md` (line 106 and 199) describe the look as "navy and lime, Poppins and Inter". The built pages do not match that:

- Lime (`#d9efa5`, `#d7e995`) only appears in the early `user-profile.html` block and in the planner. The profile page replaced it with gold on 2026-09-26.
- The live marketing pages use **deep green `#0B4F3A`**, **navy `#0E2B5C`** and **gold `#D4A017`**. The logo (`images/img-01.png`) is a dark green TT monogram on white.

This guide follows the built pages: green, navy, gold. The spec and `CLAUDE.md` should be updated to say so (not done here).

## 2. How the system is shared

```
packages/ui/
  package.json              # name: "@ttg/ui" (placeholder, see Open questions)
  src/styles/
    theme.css               # Skeleton custom theme  [data-theme='ttg']
    tokens.css              # Tailwind @theme extras: fonts, shadows, radius, breakpoint, container
    base.css                # focus ring, reduced motion, button/card overrides, print
    index.css               # @import of the three above (single entry: "@ttg/ui/styles.css")
  src/lib/                  # Svelte components built on skeleton-svelte (section 10)
    index.ts
```

Rules:

1. `packages/ui` is the only place colors, fonts, radii and shadows are defined. Apps and `packages/ui` components use tokens and Skeleton classes, never raw hex.
2. Both apps import the same stylesheet and set the same theme:

```css
/* apps/*/src/routes/layout.css */
@import 'tailwindcss';
@import '@skeletonlabs/skeleton';
@import '@skeletonlabs/skeleton-svelte';
@import '@ttg/ui/styles.css';              /* theme.css + tokens.css + base.css */
@source '../../../../packages/ui/src';     /* let Tailwind scan shared components */
```

```html
<!-- apps/*/src/app.html -->
<html lang="en" data-theme="ttg">
```

3. Skeleton's own docs pin the install order (`@import 'tailwindcss'`, then Skeleton, then Skeleton Svelte, then theme files). Custom theme files go after the Skeleton imports.
4. Packages are installed with Bun, as dev dependencies of each app (per the Skeleton install page) and declared as peer dependencies of `packages/ui`:

```bash
bun add -d @skeletonlabs/skeleton @skeletonlabs/skeleton-svelte tailwindcss
bun add -d @fontsource-variable/inter @fontsource/poppins   # self-hosted fonts, see section 6
bun add @lucide/svelte                                       # icons, see section 9
```

5. The marketing site is `adapter-static`, the app is SSR on Bun. Nothing in `packages/ui` may depend on a server runtime, so it works in both.
6. Marketing and app differ only in density and chrome (section 11), not in tokens.

## 3. Where the four pages disagree, and the choice

| Topic | index.html / golf-lessons | user-profile.html | index-trey-website.html (planner) | Choice |
|---|---|---|---|---|
| Primary brand color | green `#0B4F3A`, deep `#08392A` | final block: same. Early block: `#193b30` / `#102c24` | `#18372b`, `#284b3c` | `#0B4F3A` (deep `#08392A`) |
| Accent | gold `#D4A017`, soft `#e6bf55` | final block: gold. Early block: lime `#d9efa5` | lime `#d7e995`, gold `#b29058` | gold `#D4A017` (soft `#E6BF55`) |
| Headline color | navy `#0E2B5C` | navy (final block) | green `#18372b` | navy `#0E2B5C` |
| Body text | charcoal `#333333` | `#333333` | `#202b25` | `#333333` |
| Display font | Poppins 700/800 | Poppins (final block). Early block Georgia | Playfair Display | Poppins |
| Body font | Inter | Inter (final block) | DM Sans | Inter |
| Page background | white, alt sections `#F6F6F4` | paper `#F6F6F4` | `#f5f5ef` | white for marketing; `#F6F6F4` as app canvas |
| Card radius | 22px (`--radius-lg`), 16px (`--radius-md`) | 16px | 13px, 10px | 16px default container, 22px for hero/feature panels |
| Input radius | 10px | 6px | 7px | 10px |
| Button shape | pill (100px) | pill (999px) | 7px radius | pill |
| Button text | uppercase, 13.5px, `.08em` tracking | sentence case, 16px | 13px, sentence case | sentence case by default, uppercase only for marketing hero CTAs |
| Main CTA color | gold fill, navy text | gold (`.btn.light`) | green fill | gold fill + navy text for the one main CTA, green fill for ordinary actions |
| Card border | `rgba(11,79,58,.06)` or `#E8E8E8` | `#E1E5E2` | `#e2e6dd` | `#E8E8E8` (`surface-200`); the profile's `#E1E5E2` is retired |
| Page max width | 1180px (lessons page 940px) | content 1400px | 960px | 1180px site, 940px reading pages, 1400px app content |
| Focus ring | none defined | 3px gold, offset 3px | green glow on inputs | 3px navy (gold on dark backgrounds); see section 11 |
| Breakpoints | min-width: 560, 600, 640, 700, 760, 860, 900, 960, 1080, 1180 | max-width: 650, 1100 | max-width: 650, 900 | collapse to the set in section 11.1 |
| Body size | browser default 16px, `p` line-height 1.65 | 16px, line-height 1.5 | 14px, later raised to 16px | 16px, line-height 1.65 for prose and 1.5 for UI |
| Reduced motion rule | present (`index.html` only) | absent | absent | required everywhere |
| Icons | inline SVG, stroke 1.8, round caps | emoji and text | none | Lucide at stroke 1.8 |
| Print styles | none | none | full Letter print sheet | keep the planner's sheet (section 12) |

Everything in the planner that differs (Playfair, DM Sans, lime, `#18372b`) is dropped during migration. Its layout, its mobile "range-first" rules and its print rules are kept.

## 4. Skeleton UI: what we verified (2026-10-12)

| Item | Finding |
|---|---|
| Current major | **v5**. `@skeletonlabs/skeleton` and `@skeletonlabs/skeleton-svelte` are both `5.0.1` on npm (registry `latest`). |
| Requirements | SvelteKit 3 (npm `latest` is 3.0.1; Skeleton declares no SvelteKit peer, only Svelte), Svelte 5 (`skeleton-svelte` peer `svelte ^5.40.0`), Tailwind 4 (`skeleton` peer `tailwindcss ^4.0.0`). |
| Packages | `@skeletonlabs/skeleton` (framework-agnostic core: Tailwind plugin, themes, presets) and `@skeletonlabs/skeleton-svelte` (headless-style components built on Zag). Install both as dev dependencies. |
| CSS entry | `@import 'tailwindcss'; @import '@skeletonlabs/skeleton'; @import '@skeletonlabs/skeleton-svelte'; @import '@skeletonlabs/skeleton/themes/<name>';` in `src/routes/layout.css`. No `tailwind.config.js`; Tailwind 4 is CSS-first. |
| Activating a theme | `data-theme="<name>"` on `<html>` in `src/app.html`. |
| Custom themes | A CSS file of custom properties scoped to `[data-theme='<name>']`, imported after the Skeleton import. The Theme Generator (`themes.skeleton.dev`) exports this file. Preset themes (e.g. `cerberus`) are the reference for the full variable list; section 6 follows that list. |
| Tokens in a theme | `--spacing`, `--text-scaling`, `--typo-base--*`, `--typo-heading--*`, `--typo-anchor--*`, `--radius-base`, `--radius-container`, `--default-border-width/outline-width/ring-width`, `--corner-shape-base/container`, `--color-root-bg-light/dark`, `--color-brand-*`, and eleven-shade ramps `--color-{primary,secondary,tertiary,success,warning,error,surface}-{50..950}` each with `--color-*-contrast-{50..950}` plus `-contrast-light` / `-contrast-dark`. Preset themes write ramps in `oklch()`; hex is also valid CSS and is used here to stay traceable to the pages. |
| Color pairings | `bg-surface-50-950`, `preset-filled-primary-500`, `preset-tonal-*`, `preset-outlined-*` use CSS `light-dark()`, so a ramp that is well formed also produces a working dark mode without extra CSS. |
| Dark mode | Tailwind `dark:` variant. Default strategy is `media` (OS setting). `.dark` class or `data-mode` attribute strategies are enabled with a `@custom-variant dark (...)` line. |
| Names changed from older versions | Modal is now **Dialog** (`Dialog.Trigger/Backdrop/Positioner/Content/Title/Description/CloseTrigger`, wrapped in `Portal`). Toasts use `createToaster()` plus one `<Toast.Group>` at the root. Tabs, Accordion, Switch, Slider, Progress, Navigation are compound components (`Tabs.List/Trigger/Content/Indicator`, `Accordion.Item/ItemTrigger/ItemContent`, `Switch.Control/Thumb/Label`, `Progress.Track/Range/Label/ValueText`). `AppBar` is `AppBar.Toolbar/Lead/Headline/Trail`. `Navigation` has `layout="bar" | "rail" | "sidebar"`. The old `AppShell`, `ProgressBar`, `RadioGroup` and `SlideToggle` names are gone. |
| Component catalogue (Svelte) | Accordion, App Bar, Avatar, Carousel, Collapsible, Combobox, Date Picker, Dialog, File Upload, Floating Panel, Listbox, Locale Provider, Marquee, Menu, Navigation, Pagination, Popover, Portal, Progress (Circular, Linear), QR Code, Rating Group, Segmented Control, Slider, Steps, Switch, Tabs, Tags Input, Toast, Toggle Group, Tooltip, Tree View. |
| Tailwind-only components | Badges, Buttons, Cards, Chips, Dialogs (styling), Disclosures (`<details>`), Dividers, Forms and Inputs, Placeholders (skeleton loaders), Tables. Classes: `btn btn-{xs,sm,base,lg,xl}`, `btn-icon`, `btn-group`, `card`, `badge`, `chip`, `input`, `select`, `textarea`, `checkbox`, `label`, `table table-zebra`, `hr`, with `preset-filled-*`, `preset-tonal-*`, `preset-outlined-*`. |

Doc URLs used (all under `https://www.skeleton.dev/docs/svelte/` unless noted):

- `get-started/installation/sveltekit`, `get-started/core-api`, `get-started/migrate-from-v4`
- `design/themes`, `design/colors`, `design/typography`, `design/spacing`, `design/globals`, `design/iconography`
- `guides/mode` (dark mode), `tailwind-utilities/presets`
- `tailwind-components/{buttons,cards,forms,badges,chips,tables}`
- `framework-components/{app-bar,navigation,dialog,toast,tabs,accordion,steps,progress-linear,switch,slider,segmented-control,floating-panel,avatar,file-upload}`
- `https://themes.skeleton.dev/` (Theme Generator)
- `https://www.skeleton.dev/llms.txt` (full doc index)
- Reference theme source: `https://github.com/skeletonlabs/skeleton/blob/main/packages/skeleton/src/themes/cerberus.css`
- npm registry entries for both packages (version and peer dependencies)

Caveat: the doc pages were read through a summarizing fetcher and raw files, so exact sub-component prop names should be checked against the page when each component is first used. Pin nothing in this guide; install the latest 5.x.

## 5. Design tokens

### 5.1 Extracted palette (what the pages actually use)

| Token in pages | Hex | Where used |
|---|---|---|
| `--green` | `#0B4F3A` | hero, primary buttons, active nav, step badges, logo color, chart bars, own chat bubbles |
| `--green-deep` | `#08392A` | footer, CTA bands, hero gradient end, feature card gradient end |
| hero gradient start | `#0d3f2e` | top of marketing hero |
| pathway section end | `#072a1e` | bottom of dark pathway section |
| `--navy` | `#0E2B5C` | all headings, philosophy strip, mobile menu, booking section, outline buttons |
| `--gold` | `#D4A017` | eyebrows, bullets, main CTA fill, tags, borders on cards |
| `--gold-soft` | `#E6BF55` | gold text and icons on dark backgrounds |
| `--white` | `#FFFFFF` | page, cards |
| `--charcoal` | `#333333` | body text |
| `--gray` | `#E8E8E8` | borders, dashed dividers |
| `--gray-warm` | `#F6F6F4` | alternate section background, input fill, app canvas |
| `--line` (profile) | `#E1E5E2` | app borders |
| `--muted` (profile) | `#4c5c56` | secondary text in the app |
| Greys in marketing copy | `#555`, `#5b5b5b`, `#666`, `#888`, `#999` | secondary text. `#888` and `#999` fail contrast, see 11.1 |
| Tag tints (profile) | `#e9f1ec` on green text; `#fbf1d5` on `#735408` | tags |
| Form success | bg `#eef7f1`, border `#bfe3cd`, text `#08392A` | booking confirmation |
| Gold text on white (profile) | `#946d08` | small brand caption |
| Planner-only | `#18372b`, `#284b3c`, `#d7e995`, `#b29058`, `#f5f5ef`, `#768178`, `#e2e6dd`, `#edf1e8`, `#172f27` | dropped in migration |

### 5.2 Skeleton role mapping

Skeleton needs seven ramps. The ramps below keep the brand color at shade 500 and build lighter shades by mixing with white (50 to 400) and darker shades by mixing with black (600 to 950). Exceptions: `primary-700` is pinned to the brand deep green `#08392A`, and `primary-600` is `#0A4633`. `surface` is built by hand from the page greys.

| Role | Meaning in this product | 500 | Key shades | Contrast on 500 |
|---|---|---|---|---|
| `primary` | Brand green. Buttons, active nav, links, step badges, own chat bubbles, charts | `#0B4F3A` | 50 `#EBF1EF`, 100 `#D3DFDC`, 700 `#08392A` (deep), 950 `#031610` | white 9.6:1 |
| `secondary` | Navy. Headings, dark sections, outline buttons, focus ring | `#0E2B5C` | 50 `#ECEEF2`, 100 `#D4D9E2`, 950 `#040C1A` | white 13.8:1 |
| `tertiary` | Gold. Main CTA, eyebrows, tags, accents. Never text on white at 500 | `#D4A017` | 400 `#DDB54A`, 300 `#E7CB7F` (about `--gold-soft` `#E6BF55`), 800 `#7B5D0D` (gold text on white) | navy 5.8:1 |
| `success` | **Proposed.** Confirmations, "ready" status, uploaded OK | `#2E7D4F` | 50 `#EEF5F1`, 700 `#225C3A` | white 5.1:1 |
| `warning` | **Proposed.** Pending, processing, "needs attention" | `#B7791F` | 50 `#F9F4ED`, 800 `#6A4612` | near-black `#1A1A1A` 4.8:1 |
| `error` | **Proposed.** Failed upload, payment problem, destructive actions | `#B3261E` | 50 `#F9EEED`, 700 `#841C16` | white 6.5:1 |
| `surface` | Neutrals. Page, cards, borders, text | `#69726D` | 50 `#FFFFFF`, 100 `#F6F6F4`, 200 `#E8E8E8`, 600 `#4C5C56`, 700 `#333333`, 950 `#0E1311` | white 5.0:1 |

The pages contain no true red, no distinct success green and no amber (only the `#806329` "pending" text in the planner). Those three are proposals; see Open questions.

Semantic usage:

| Need | Token |
|---|---|
| Page background (marketing) | `bg-surface-50` (white) |
| Alt section / app canvas | `bg-surface-100` (`#F6F6F4`) |
| Card on canvas | `bg-surface-50` + `border border-surface-200`  |
| Body text | `text-surface-700` (`#333333`) |
| Secondary text | `text-surface-600` (`#4C5C56`, 7.1:1 on white). Never lighter than `surface-500` for text |
| Headings | `text-secondary-500` (navy) |
| Link | `text-primary-500`, underline on hover |
| Eyebrow on light | `text-tertiary-800` (gold-brown, 6.2:1) |
| Eyebrow on dark | `text-tertiary-400` / `#E6BF55` |
| Dark section | `bg-primary-700` (deep green) or `bg-secondary-500` (navy), text `text-white` and `text-white/75` minimum for secondary copy |
| Main CTA | `preset-filled-tertiary-500` (gold fill, navy text) |
| Standard action | `preset-filled-primary-500` |
| Secondary action | `preset-outlined-secondary-500` (navy outline) on light, `border-white/55 text-white` on dark |
| Tag / badge | `preset-tonal-primary` (green on `#E9F1EC`-like tint) or `preset-filled-tertiary-500` for "New" |

## 6. Skeleton custom theme and tokens (ready to use)

`packages/ui/src/styles/theme.css`. The ramps and contrast mappings below were computed, not guessed: each `-contrast-{shade}` picks the `dark` or `light` contrast color with the higher WCAG ratio against that shade (ratio noted in the comment). Two shades fall under 4.5:1 for normal text and must only carry large text or non-text UI: `tertiary-700` (4.2:1) and `error-400` (4.4:1).

```css
/* packages/ui/src/styles/theme.css
   Trey Thornock Golf: green #0B4F3A, navy #0E2B5C, gold #D4A017, Poppins + Inter.
   Structure follows Skeleton v5 preset themes (cerberus). */
[data-theme='ttg'] {
  --spacing: 0.25rem;
  --text-scaling: 1;

  /* Typography */
  --typo-base--font-family: 'Inter Variable', 'Inter', system-ui, sans-serif;
  --typo-base--font-size: inherit;
  --typo-base--color-light: var(--color-surface-700);   /* #333333 */
  --typo-base--color-dark: var(--color-surface-100);
  --typo-base--line-height: 1.65;
  --typo-base--font-weight: normal;
  --typo-heading--font-family: 'Poppins', 'Inter Variable', system-ui, sans-serif;
  --typo-heading--color-light: var(--color-secondary-500); /* navy */
  --typo-heading--color-dark: var(--color-secondary-100);
  --typo-heading--font-weight: 700;
  --typo-heading--letter-spacing: -0.01em;
  --typo-anchor--color-light: var(--color-primary-500);
  --typo-anchor--color-dark: var(--color-primary-300);
  --typo-anchor--text-decoration-line: none;
  --typo-anchor--hover--text-decoration-line: underline;

  /* Shape. Cards 16px, controls 10px. Pill buttons are set in base.css. */
  --radius-base: 0.625rem;        /* 10px: inputs, menus, small tiles */
  --radius-container: 1rem;       /* 16px: cards, dialogs */
  --default-border-width: 1px;
  --default-outline-width: 3px;   /* focus ring width, never 0 */
  --default-ring-width: 1px;
  --corner-shape-base: round;     /* squircle has limited browser support */
  --corner-shape-container: round;

  /* Surfaces */
  --color-root-bg-light: var(--color-surface-50);
  --color-root-bg-dark: var(--color-surface-950);
  --color-brand-light: var(--color-primary-500);
  --color-brand-contrast-light: var(--color-primary-contrast-500);
  --color-brand-dark: var(--color-primary-300);
  --color-brand-contrast-dark: var(--color-primary-contrast-300);

  /* primary */
  --color-primary-50: #EBF1EF;
  --color-primary-100: #D3DFDC;
  --color-primary-200: #AAC1BA;
  --color-primary-300: #799E93;
  --color-primary-400: #417665;
  --color-primary-500: #0B4F3A;
  --color-primary-600: #0A4633;
  --color-primary-700: #08392A;
  --color-primary-800: #062E22;
  --color-primary-900: #052118;
  --color-primary-950: #031610;
  --color-primary-contrast-dark: #031610;
  --color-primary-contrast-light: #FFFFFF;
  --color-primary-contrast-50: var(--color-primary-contrast-dark); /* 16.3:1 */
  --color-primary-contrast-100: var(--color-primary-contrast-dark); /* 13.6:1 */
  --color-primary-contrast-200: var(--color-primary-contrast-dark); /* 9.8:1 */
  --color-primary-contrast-300: var(--color-primary-contrast-dark); /* 6.3:1 */
  --color-primary-contrast-400: var(--color-primary-contrast-light); /* 5.2:1 */
  --color-primary-contrast-500: var(--color-primary-contrast-light); /* 9.6:1 */
  --color-primary-contrast-600: var(--color-primary-contrast-light); /* 10.8:1 */
  --color-primary-contrast-700: var(--color-primary-contrast-light); /* 12.9:1 */
  --color-primary-contrast-800: var(--color-primary-contrast-light); /* 14.8:1 */
  --color-primary-contrast-900: var(--color-primary-contrast-light); /* 17.0:1 */
  --color-primary-contrast-950: var(--color-primary-contrast-light); /* 18.6:1 */
  /* secondary */
  --color-secondary-50: #ECEEF2;
  --color-secondary-100: #D4D9E2;
  --color-secondary-200: #ABB5C6;
  --color-secondary-300: #7A8AA5;
  --color-secondary-400: #435A80;
  --color-secondary-500: #0E2B5C;
  --color-secondary-600: #0C2651;
  --color-secondary-700: #0A2044;
  --color-secondary-800: #081935;
  --color-secondary-900: #061227;
  --color-secondary-950: #040C1A;
  --color-secondary-contrast-dark: #040C1A;
  --color-secondary-contrast-light: #FFFFFF;
  --color-secondary-contrast-50: var(--color-secondary-contrast-dark); /* 16.9:1 */
  --color-secondary-contrast-100: var(--color-secondary-contrast-dark); /* 13.8:1 */
  --color-secondary-contrast-200: var(--color-secondary-contrast-dark); /* 9.5:1 */
  --color-secondary-contrast-300: var(--color-secondary-contrast-dark); /* 5.6:1 */
  --color-secondary-contrast-400: var(--color-secondary-contrast-light); /* 7.0:1 */
  --color-secondary-contrast-500: var(--color-secondary-contrast-light); /* 13.8:1 */
  --color-secondary-contrast-600: var(--color-secondary-contrast-light); /* 14.9:1 */
  --color-secondary-contrast-700: var(--color-secondary-contrast-light); /* 16.1:1 */
  --color-secondary-contrast-800: var(--color-secondary-contrast-light); /* 17.5:1 */
  --color-secondary-contrast-900: var(--color-secondary-contrast-light); /* 18.7:1 */
  --color-secondary-contrast-950: var(--color-secondary-contrast-light); /* 19.6:1 */
  /* tertiary */
  --color-tertiary-50: #FCF7EC;
  --color-tertiary-100: #F7EED5;
  --color-tertiary-200: #F0DEAE;
  --color-tertiary-300: #E7CB7F;
  --color-tertiary-400: #DDB54A;
  --color-tertiary-500: #D4A017;
  --color-tertiary-600: #BB8D14;
  --color-tertiary-700: #9D7611;
  --color-tertiary-800: #7B5D0D;
  --color-tertiary-900: #59430A;
  --color-tertiary-950: #3B2D06;
  --color-tertiary-contrast-dark: #0E2B5C;
  --color-tertiary-contrast-light: #FFFFFF;
  --color-tertiary-contrast-50: var(--color-tertiary-contrast-dark); /* 12.9:1 */
  --color-tertiary-contrast-100: var(--color-tertiary-contrast-dark); /* 11.9:1 */
  --color-tertiary-contrast-200: var(--color-tertiary-contrast-dark); /* 10.4:1 */
  --color-tertiary-contrast-300: var(--color-tertiary-contrast-dark); /* 8.7:1 */
  --color-tertiary-contrast-400: var(--color-tertiary-contrast-dark); /* 7.1:1 */
  --color-tertiary-contrast-500: var(--color-tertiary-contrast-dark); /* 5.8:1 */
  --color-tertiary-contrast-600: var(--color-tertiary-contrast-dark); /* 4.6:1 */
  --color-tertiary-contrast-700: var(--color-tertiary-contrast-light); /* 4.2:1 */
  --color-tertiary-contrast-800: var(--color-tertiary-contrast-light); /* 6.2:1 */
  --color-tertiary-contrast-900: var(--color-tertiary-contrast-light); /* 9.4:1 */
  --color-tertiary-contrast-950: var(--color-tertiary-contrast-light); /* 13.4:1 */
  /* success */
  --color-success-50: #EEF5F1;
  --color-success-100: #D9E8DF;
  --color-success-200: #B6D2C1;
  --color-success-300: #8CB89E;
  --color-success-400: #5C9A76;
  --color-success-500: #2E7D4F;
  --color-success-600: #286E46;
  --color-success-700: #225C3A;
  --color-success-800: #1B492E;
  --color-success-900: #133521;
  --color-success-950: #0D2316;
  --color-success-contrast-dark: #0D2316;
  --color-success-contrast-light: #FFFFFF;
  --color-success-contrast-50: var(--color-success-contrast-dark); /* 14.9:1 */
  --color-success-contrast-100: var(--color-success-contrast-dark); /* 13.0:1 */
  --color-success-contrast-200: var(--color-success-contrast-dark); /* 10.2:1 */
  --color-success-contrast-300: var(--color-success-contrast-dark); /* 7.5:1 */
  --color-success-contrast-400: var(--color-success-contrast-dark); /* 5.0:1 */
  --color-success-contrast-500: var(--color-success-contrast-light); /* 5.0:1 */
  --color-success-contrast-600: var(--color-success-contrast-light); /* 6.2:1 */
  --color-success-contrast-700: var(--color-success-contrast-light); /* 7.9:1 */
  --color-success-contrast-800: var(--color-success-contrast-light); /* 10.3:1 */
  --color-success-contrast-900: var(--color-success-contrast-light); /* 13.5:1 */
  --color-success-contrast-950: var(--color-success-contrast-light); /* 16.5:1 */
  /* warning */
  --color-warning-50: #F9F4ED;
  --color-warning-100: #F2E7D7;
  --color-warning-200: #E6D0B1;
  --color-warning-300: #D7B584;
  --color-warning-400: #C79650;
  --color-warning-500: #B7791F;
  --color-warning-600: #A16A1B;
  --color-warning-700: #875A17;
  --color-warning-800: #6A4612;
  --color-warning-900: #4D330D;
  --color-warning-950: #332209;
  --color-warning-contrast-dark: #1A1A1A;
  --color-warning-contrast-light: #FFFFFF;
  --color-warning-contrast-50: var(--color-warning-contrast-dark); /* 15.9:1 */
  --color-warning-contrast-100: var(--color-warning-contrast-dark); /* 14.2:1 */
  --color-warning-contrast-200: var(--color-warning-contrast-dark); /* 11.6:1 */
  --color-warning-contrast-300: var(--color-warning-contrast-dark); /* 9.0:1 */
  --color-warning-contrast-400: var(--color-warning-contrast-dark); /* 6.6:1 */
  --color-warning-contrast-500: var(--color-warning-contrast-dark); /* 4.8:1 */
  --color-warning-contrast-600: var(--color-warning-contrast-light); /* 4.6:1 */
  --color-warning-contrast-700: var(--color-warning-contrast-light); /* 6.0:1 */
  --color-warning-contrast-800: var(--color-warning-contrast-light); /* 8.4:1 */
  --color-warning-contrast-900: var(--color-warning-contrast-light); /* 11.7:1 */
  --color-warning-contrast-950: var(--color-warning-contrast-light); /* 15.3:1 */
  /* error */
  --color-error-50: #F9EEED;
  --color-error-100: #F1D8D6;
  --color-error-200: #E4B3B0;
  --color-error-300: #D58883;
  --color-error-400: #C45650;
  --color-error-500: #B3261E;
  --color-error-600: #9E211A;
  --color-error-700: #841C16;
  --color-error-800: #681611;
  --color-error-900: #4B100D;
  --color-error-950: #320B08;
  --color-error-contrast-dark: #320B08;
  --color-error-contrast-light: #FFFFFF;
  --color-error-contrast-50: var(--color-error-contrast-dark); /* 15.6:1 */
  --color-error-contrast-100: var(--color-error-contrast-dark); /* 13.1:1 */
  --color-error-contrast-200: var(--color-error-contrast-dark); /* 9.6:1 */
  --color-error-contrast-300: var(--color-error-contrast-dark); /* 6.5:1 */
  --color-error-contrast-400: var(--color-error-contrast-light); /* 4.4:1 */
  --color-error-contrast-500: var(--color-error-contrast-light); /* 6.5:1 */
  --color-error-contrast-600: var(--color-error-contrast-light); /* 7.8:1 */
  --color-error-contrast-700: var(--color-error-contrast-light); /* 9.7:1 */
  --color-error-contrast-800: var(--color-error-contrast-light); /* 12.3:1 */
  --color-error-contrast-900: var(--color-error-contrast-light); /* 15.2:1 */
  --color-error-contrast-950: var(--color-error-contrast-light); /* 17.7:1 */
  /* surface */
  --color-surface-50: #FFFFFF;
  --color-surface-100: #F6F6F4;
  --color-surface-200: #E8E8E8;
  --color-surface-300: #CFD3D0;
  --color-surface-400: #A3AAA6;
  --color-surface-500: #69726D;
  --color-surface-600: #4C5C56;
  --color-surface-700: #333333;
  --color-surface-800: #232B27;
  --color-surface-900: #171D1A;
  --color-surface-950: #0E1311;
  --color-surface-contrast-dark: #0E1311;
  --color-surface-contrast-light: #FFFFFF;
  --color-surface-contrast-50: var(--color-surface-contrast-dark); /* 18.8:1 */
  --color-surface-contrast-100: var(--color-surface-contrast-dark); /* 17.3:1 */
  --color-surface-contrast-200: var(--color-surface-contrast-dark); /* 15.3:1 */
  --color-surface-contrast-300: var(--color-surface-contrast-dark); /* 12.4:1 */
  --color-surface-contrast-400: var(--color-surface-contrast-dark); /* 7.9:1 */
  --color-surface-contrast-500: var(--color-surface-contrast-light); /* 5.0:1 */
  --color-surface-contrast-600: var(--color-surface-contrast-light); /* 7.1:1 */
  --color-surface-contrast-700: var(--color-surface-contrast-light); /* 12.6:1 */
  --color-surface-contrast-800: var(--color-surface-contrast-light); /* 14.5:1 */
  --color-surface-contrast-900: var(--color-surface-contrast-light); /* 17.1:1 */
  --color-surface-contrast-950: var(--color-surface-contrast-light); /* 18.8:1 */
}
```

`packages/ui/src/styles/tokens.css` (values taken directly from the pages):

```css
@theme {
  --font-display: 'Poppins', 'Inter Variable', system-ui, sans-serif;
  --font-body: 'Inter Variable', 'Inter', system-ui, sans-serif;

  /* Shadows (green tinted, from --shadow-soft / --shadow-lift) */
  --shadow-soft: 0 10px 30px rgb(11 79 58 / 0.10);
  --shadow-lift: 0 18px 40px rgb(11 79 58 / 0.16);
  --shadow-hero: 0 24px 60px rgb(0 0 0 / 0.35);        /* photo on dark hero */
  --shadow-gold: 0 14px 28px rgb(212 160 23 / 0.35);   /* gold button hover */
  --shadow-bar: 0 6px 24px rgb(0 0 0 / 0.06);          /* sticky header once scrolled */

  --radius-hero: 1.375rem;     /* 22px: hero photo, feature panels, price cards */
  --radius-pill: 6.25rem;      /* 100px: buttons, tags, tabs */

  --container-site: 73.75rem;  /* 1180px */
  --container-reading: 58.75rem; /* 940px */
  --container-app: 87.5rem;    /* 1400px */

  --breakpoint-nav: 73.75rem;  /* 1180px: desktop nav appears (marketing has 8+ links) */

  --ease-menu: cubic-bezier(0.65, 0, 0.35, 1);
}
```

`packages/ui/src/styles/base.css` (global rules the pages already rely on, plus the fixes from section 11 and the dark-mode rules from section 16). Brand overrides of Skeleton classes (`.btn`, `.preset-*`) sit in `@layer utilities` because Skeleton v5 ships those there; a `components` layer rule loses the cascade (verified 2026-10-12):

```css
@layer base {
  html { scroll-behavior: smooth; }
  body { -webkit-font-smoothing: antialiased; overflow-x: hidden; }
  img { max-width: 100%; display: block; }

  /* Focus: navy on light, gold on dark. 3:1 minimum for non-text. */
  :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: 3px solid var(--color-secondary-500);
    outline-offset: 3px;
  }
  :where(.on-dark) :focus-visible { outline-color: var(--color-tertiary-400); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
}

/* Skeleton ships .btn and presets in the utilities layer, so brand overrides live there too
   (and are imported after Skeleton) or they lose the cascade. */
@layer utilities {
  /* Pill buttons in Poppins, as on every page */
  .btn { border-radius: var(--radius-pill); font-family: var(--font-display); font-weight: 600; }
  .btn-cta { text-transform: uppercase; letter-spacing: 0.08em; padding-inline: 1.875rem; }
  .eyebrow {
    font-family: var(--font-display); font-weight: 600; font-size: 0.78rem; /* 12.5px */
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--color-tertiary-800);
  }
  .on-dark .eyebrow { color: var(--color-tertiary-400); }

  .preset-outlined-secondary-500 { color: var(--color-secondary-500); }

  /* Raised surfaces (app bar, nav, cards, dialogs): white in light, surface-900 in dark (style-guide 16.2).
     Skeleton pairs only shades that sum to 1000, so surface-50/900 needs this utility. */
  .surface-raised { background-color: light-dark(var(--color-surface-50), var(--color-surface-900)); }

  @media (prefers-color-scheme: dark) {
    .eyebrow { color: var(--color-tertiary-400); }
    /* outline secondary: navy would vanish on the dark page */
    .preset-outlined-secondary-500 {
      border-color: var(--color-surface-300);
      color: var(--color-surface-300);
    }
  }
}

/* Dark mode follows the OS (style-guide section 16). */
:root { color-scheme: light dark; }

@layer base {
  @media (prefers-color-scheme: dark) {
    :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
      outline-color: var(--color-tertiary-400);
    }
  }
}

/* Skeleton ships .btn and presets in the utilities layer, so brand overrides live there too
   (and are imported after Skeleton) or they lose the cascade. */
@layer utilities {
  @media (prefers-color-scheme: dark) {
    /* 500 fill nearly vanishes on the dark page: use 400 with white text */
    .preset-filled-primary-500 {
      background-color: var(--color-primary-400);
      color: var(--color-primary-contrast-400);
    }
  }
}

@media print {
  :root { color-scheme: light; }
}
```

Fonts: self-host with Fontsource instead of the Google Fonts `<link>` the pages use (faster, works offline in the PWA, no third-party request). Import in the app layout: `@fontsource-variable/inter` and `@fontsource/poppins/{400,500,600,700,800}.css`. The pages load Poppins 400/500/600/700/800 and Inter 400/500/600/700; keep exactly those weights. (Fontsource package names follow its convention and should be confirmed at install.)

## 7. Typography scale

Poppins is for headings, eyebrows, buttons, nav, prices and numerals. Inter is for body, forms, captions. Sizes are the pages' own values, with the nearest Tailwind class where one exists.

| Style | Font | Size | Weight | Line height | Tracking | Source |
|---|---|---|---|---|---|---|
| Hero H1 (marketing) | Poppins | `clamp(40px, 7.4vw, 68px)` | 800 | 1.03 | -0.02em | `.hero h1` |
| Page H1 (inner pages) | Poppins | `clamp(30px, 5vw, 46px)` | 700 | 1.15 | -0.01em | lessons page `h1` |
| App H1 | Poppins | 34px (25px on phones) | 700 | 1.25 | -0.5px | profile final block |
| Section H2 | Poppins | `clamp(28px, 4.4vw, 40px)` | 700 | 1.15 | -0.01em | `.section-head h2` |
| Inner H2 | Poppins | `clamp(22px, 3.4vw, 30px)` | 700 | 1.2 | 0 | lessons page `h2` |
| App H2 | Poppins | 25px (23px phones) | 700 | 1.25 | -0.5px | profile |
| Card H3 | Poppins | 17 to 20px (19px default) | 700 | 1.3 | 0 | `.pillar-card h3`, `.service-body h3` |
| Small H3/H4 | Poppins | 14 to 17px | 700 | 1.3 | 0 | contact card, step cards |
| Lead paragraph | Inter | 16.5px (marketing), 17.5px (inner pages) | 400 | 1.7 | 0 | `.section-head p`, `.lead` |
| Body | Inter | 16px | 400 | 1.65 | 0 | `p` |
| Card body | Inter | 14.5px | 400 | 1.65 | 0 | cards |
| Caption / helper | Inter | 12 to 13.5px | 400 to 500 | 1.5 | 0 | notes, helpers |
| Eyebrow | Poppins | 12.5px | 600 | 1 | 0.16em, uppercase | `.eyebrow` |
| Button (default) | Poppins | 14.5px (16px on phones) | 600 | 1 | 0.1px | app `.btn` |
| Button (CTA) | Poppins | 13.5px | 600 | 1 | 0.08em, uppercase | marketing `.btn` |
| Nav link | Poppins | 13px | 500 | 1 | 0 | `nav.primary-links` |
| Form label | Poppins | 12px, uppercase (marketing) or 14px sentence case (app) | 600 | 1.4 | 0.04em | forms |
| Stat / metric number | Poppins | 22 to 34px | 700 to 800 | 1 | 0 | hero stats, metrics, prices |
| Price | Poppins | 30 to 34px | 800 | 1 | 0 | `.price-amount` |

Rules:

- One H1 per page. Headings navy on light, white on dark.
- Do not set body text below 14px. The profile page's 12px is for captions and eyebrows only.
- On touch screens, inputs are 16px (profile page rule) so iOS does not zoom on focus.
- Opt in to Skeleton's `h1` to `h6` classes only where Tailwind sizes are needed; otherwise use the sizes above through `@apply` in `packages/ui` components.

## 8. Spacing, radius, shadow, borders, motion

### Spacing

Base unit is Skeleton's `--spacing: 0.25rem` (4px). The pages' recurring values map as follows (Tailwind 4 accepts half steps):

| Page value | Tailwind | Use |
|---|---|---|
| 22px | `px-5.5` | page gutter (`.wrap`) |
| 76px / 108px (>= 900px) | `py-19` / `py-27` | marketing section padding |
| 56px | `py-14` | inner-page section padding |
| 44px | `mb-11` | under section heads |
| 24px | `gap-6` | card grid gap |
| 18 to 20px | `gap-4.5` to `gap-5` | tight card grids |
| 26 to 34px | `p-6.5` to `p-8.5` | card padding (28px default: `p-7`) |
| 14px | `gap-3.5` | button rows, chips |
| 8 to 9px | `gap-2` | tag rows |

App screens use `p-5` cards and `gap-4` rows; phone cards `p-5` (20px).

### Radius

| Token | Value | Use |
|---|---|---|
| `rounded-base` | 10px | inputs, dropdown items, small tiles |
| `rounded-container` | 16px | cards, dialogs, toasts, app panels |
| `rounded-hero` | 22px | hero photo, feature panels, pricing cards, booking form |
| `rounded-pill` | 100px | buttons, tags, tabs, status chips |
| `rounded-full` | 50% | avatars, step dots, icon circles |

### Shadow and borders

- Resting card: `shadow-soft` plus 1px border `surface-200`.
- Hover or featured: `shadow-lift`.
- Hero photo on dark: `shadow-hero` and an inset 1px `white/18` frame.
- Sticky header: 1px bottom border (`primary-500/8`), plus `shadow-bar` after scroll.
- Dividers: 1px solid `surface-200` or dashed (`border-dashed`) for price lists; on dark, `white/12` to `white/18`.
- Accent edge: 4px top border in gold (junior cards) or green (pathway steps); 2px left border for quotes and notes.

### Motion

| Pattern | Value |
|---|---|
| Button hover | `translateY(-2px)`, 0.25s ease, `shadow-gold` for gold, green shadow for green |
| Card hover | `translateY(-6px)` (cards) or `-4px` (small cards), 0.3s ease, shadow to `shadow-lift` |
| Image zoom in cards | `scale(1.05)`, 0.5s ease |
| Reveal on scroll | opacity 0 to 1 and `translateY(22px)` to 0, 0.7s ease, once |
| Tab panel | fade and 6px rise, 0.35s |
| Mobile menu | full-screen navy sheet sliding from top, 0.4s `--ease-menu` |
| Nav underline | width 0 to 100%, 0.25s |
| Disclosure icon | `+` rotates 45deg, 0.25s |
| Reduced motion | all durations 0.001ms (global rule in `base.css`) |

Hover lift is for pointer devices only: wrap in `@media (hover: hover)` so touch taps do not leave a raised card.

## 9. Icons and imagery

- **Icons**: the pages use hand-written inline SVG: 24px viewBox, `stroke="currentColor"`, no fill, `stroke-width` 1.8 (most), 2 or 1.6 (some), round linecaps and joins. Skeleton's docs use **Lucide** (`@lucide/svelte`, imported per icon, e.g. `@lucide/svelte/icons/calendar`). Use Lucide at `strokeWidth={1.8}` so the migration looks the same. Sizes: 16px in lists and prices, 18 to 20px in rows, 26px in 52px tinted tiles, 38px for large decorative icons. Green on light, `tertiary-400` on dark.
- **Icon tile**: 52px square (44px small), 14px radius (12px small), `surface-100` background, green stroke.
- **Logo**: `images/img-01.png` (240x240, dark green TT monogram on white). 40px square, 10px radius, `object-fit: contain` in the nav; 150px wide on a white 16px-radius card in the footer. Never place it on green without the white card.
- **Photos**: `object-fit: cover`, 22px radius when standalone, flush to the card edge (top corners only) inside cards. Heights: service card 170px, junior card 150px, hero photo 340px (460px at >= 960px), banner max 380px, about photo `aspect-ratio: 4/5` with `object-position: center 20%`. Hero photo `object-position: center 10%`.
- **Overlays**: hero background photo sits under a green film `linear-gradient(180deg, rgba(13,63,46,.90), rgba(11,79,58,.82) 45%, rgba(8,57,42,.94))`; service images get `linear-gradient(180deg, transparent 45%, rgba(8,20,15,.55))` at the bottom.
- **Decorative**: topographic "contour" SVG in the hero at 35% opacity, `pointer-events: none`.
- **Delivery**: WebP/AVIF with explicit `width`/`height`, lazy below the fold, hero eager (per `docs/app_spec.md`). Every `<img>` keeps a descriptive `alt` (the pages already do). Video poster frames get the same radius as photos.

## 10. Components

Principle (from `CLAUDE.md`): prefer Skeleton components over hand-rolled ones. Use Skeleton for behavior (focus, keyboard, ARIA, portals) and style it with the tokens above. Write a custom component only when no Skeleton component fits. All shared components live in `packages/ui/src/lib` and wrap Skeleton parts with the brand classes, so apps never repeat class strings.

### 10.1 Skeleton component per pattern

| Pattern in the pages | Use | Notes |
|---|---|---|
| Sticky site header (marketing) | `AppBar` (`AppBar.Toolbar`, `Lead`, `Headline`, `Trail`) | `bg-surface-50/95 backdrop-blur border-b border-primary-500/10`; add `shadow-bar` when `scrollY > 0` |
| Hover dropdown in nav | `Menu` (or `Popover`) | Replaces CSS `:hover`. Must open on click, Enter and arrow keys; panel `rounded-container shadow-lift`, items `rounded-base` |
| Full-screen mobile menu (navy sheet) | `Dialog` styled full-screen, or `Navigation layout="sidebar"` | Navy `bg-secondary-500`, items white, sub-items `border-l-2 border-tertiary-500/40`; slide from top with `--ease-menu` 0.4s |
| App sidebar (profile) | `Navigation layout="sidebar"` | 242px, white, active item `preset-filled-primary-500`, hover `bg-primary-50` |
| App bottom nav on phones (up to 5 items; no upload item, uploading is the Upload button on /videos) | `Navigation layout="bar"` | 52px items, `env(safe-area-inset-bottom)` padding |
| Tablet nav | `Navigation layout="rail"` | See section 11 |
| Top bar with student and coach | `AppBar` | White, bottom border `surface-200` |
| Buttons | `btn` + preset | Pill. Main CTA `preset-filled-tertiary-500`, standard `preset-filled-primary-500`, secondary `preset-outlined-secondary-500`, tertiary `preset-tonal-primary`. Sizes `btn-sm`, `btn-base`, `btn-lg`. Icon-only `btn-icon` |
| Tabs and pill tab bars (pricing, profile "journey") | `Tabs` for content switching; `SegmentedControl` for 2 to 4 short filters | Active trigger `preset-filled-primary-500`, inactive `border border-surface-200`, pill radius. Tab list scrolls horizontally on phones |
| FAQ and planner "instructions" | `Accordion` (single or `multiple`), or the Tailwind `Disclosures` styling on `<details>` for static content | Item `bg-surface-100 border rounded-container`, trigger Poppins 600 15px, plus icon in gold rotating to x |
| Cards | `card` + `preset-filled-surface-50` + border | Variants in 10.2 |
| Tags and pills | `badge` / `chip` | `preset-tonal-primary` default, `preset-filled-tertiary-500` for "New" and "Featured", `preset-tonal-tertiary` for gold tags |
| Form fields | `label`, `input`, `select`, `textarea`, `checkbox` | Fill `bg-surface-100`, 1.5px border `surface-200`, radius `rounded-base`, focus swaps to white fill and `primary-500` border plus the global ring. 48px min height, 16px text on touch |
| Toggles and sliders (compare, overlay opacity, scale) | `Switch`, `Slider` | Slider range `primary-500`, thumb white with `primary-500` border; show `ValueText` |
| Upload progress, plan progress | `Progress` (linear, `Progress.Track/Range`) | 8px, track `surface-100`, range `primary-500`; use `Progress` circular for processing |
| Planner stepper (4 steps) | `Steps` | Step marker 27px circle: active/done `primary-500` white, idle `surface-200` |
| Modals (profile dialog, confirm delete) | `Dialog` inside `Portal` | `rounded-container shadow-xl`, backdrop `bg-primary-950/50`; full-screen (`100dvh`, no radius) on phones; 48px close button; `role="alertdialog"` for destructive confirms |
| Toasts | `createToaster()` + one `Toast.Group` in the root layout | Replaces the profile `.toast`: navy/deep green, white text, 8px radius; on phones sit 84px plus safe-area above the bottom bar |
| Tables (payments, sessions, journal) | `table` (`table-zebra` optional) in `table-wrap` | Header 12px `surface-600` 600, cells 14px, 13px padding, 1px row rule; the wrapper scrolls horizontally |
| Avatars | `Avatar` | 42px circle, fallback initials on `primary-500` (coach) or `primary-100` (player) |
| Date picking (assign plan date) | `DatePicker` | The calendar grid itself (coach schedule) is custom |
| File picking for avatars/attachments | `FileUpload` | Swing videos use Uppy (decided), not this |
| Annotation toolbar docking, comparison controls | `FloatingPanel` (draggable) or fixed bar | See 10.2 |
| Tooltips for toolbar icons | `Tooltip` | Required on every icon-only tool button |
| Loading states | `Placeholders` (skeleton loader classes) | Use instead of spinners for lists and cards |
| Pagination, Combobox (find player), Menu (row actions), Collapsible | `Pagination`, `Combobox`, `Menu`, `Collapsible` | Style with the same tokens |
| Dividers | `hr` | Dashed variant for price lists |

### 10.2 Custom components needed

These have no Skeleton equivalent. Each is a small Svelte component in `packages/ui`, styled only with tokens.

| Component | Spec (values from the pages) |
|---|---|
| `Hero` (marketing) | Green gradient (`#0d3f2e` to `primary-500` 55% to `primary-700`), optional bg photo plus green film, 2 columns at >= 960px (1.05fr / 0.95fr), top padding 150px (190px at >= 960px) to clear the fixed header. Eyebrow pill (white/8 fill, white/18 border, gold-soft text, 8px dot), H1 with gold-soft `<em>`, 18px sub in white/82, action row, stat trio with 2px gold left rule. Photo 340px/460px high, `rounded-hero`, `shadow-hero` |
| `SectionHead` | Centered, max 640px, eyebrow with 26px x 2px gold lead-in rule, H2, lead. `on-dark` variant flips to white |
| `PhilosophyStrip` | Navy strip, 26px padding, Poppins 13px 600 uppercase `.06em`, bold gold-soft keywords, gold chevrons at 70% |
| `LessonCard` (service/program card) | `rounded-hero`, `shadow-soft`, 1px green/6% border, 170px photo with bottom gradient, body `p-6.5` with H3 20px, 14.5px copy, gold-dot bullet list (6px dots), button pinned to the bottom. Hover lift 6px and image zoom. Junior variant: 150px photo, 4px gold top border |
| `PillarCard` | Number (Poppins 800, 13px, gold), 52px icon tile, H3 19px, copy 14.5px, `p-8.5` / `p-7`, `rounded-hero` |
| `PriceCard` / `PriceList` | Card with Poppins 800 34px amount; `featured` = green gradient (`primary-500` to `primary-700`), white text, gold "tag" pill top-right. List rows: dashed rule, name left, Poppins 700 green price right (`white-space: nowrap`) |
| `Timeline` / `Pathway` | Dark green section; 44px circular nodes (gold 14% fill, 1.5px gold border, gold-soft numeral) joined by dashed gold lines (vertical on phones, horizontal at >= 860px). Also used for the profile "phase" list (11px dot, 3px left rule, current phase green rule and gold dot) |
| `DrillCard` (practice plan drill) | Name Poppins 700 15 to 18px, duration chip, 3 labeled fields (Why, How, Success) in 12px uppercase `surface-600` labels plus 13 to 15px copy, meta tags (11px chips). Content never truncates; it must print (section 12) |
| `PracticePlanSection` (planner "stage card") | Bordered container (`rounded-container`, 1px `surface-200`; 2px `surface-400` on phones for sun readability). Header band `surface-100`: 31px (36px phone) index square `primary-500` white 11 to 14px 700, title Poppins 17 to 20px, time chip (`primary-500` fill, white, 16px bold number plus small "MIN"). Core grid 1fr / 1.4fr (single column on phones): addresses, why, drill summary, success. "Instructions" `Accordion`/disclosure at the bottom, with 44 to 46px min height, white on `primary-500` bar on phones. Sticky "range status" bar on phones: `primary-500`, 2px bottom border in gold (planner used lime), gold time chip with navy text |
| `VideoPlayerChrome` | Wraps video.js. Player frame `#14291f`-like near-black green (`primary-950`), radius 8px in lists and `rounded-container` full size. Controls bar `primary-950/90`, icons white, progress filled `tertiary-500`, buffered `white/30`, big play button a 72px gold circle with navy glyph, time labels Inter 13px tabular. Annotation markers on the timeline are 8px gold dots; keyframe annotation on canvas hides outside its `start_ms`/`end_ms`. All controls 44px minimum hit area. Do not restyle video.js internals with raw hex; map its CSS variables to tokens in one file. As built (`packages/ui/src/lib/player/VideoPlayer.svelte`): video.js runs with `controls: false` and the controls bar is Svelte markup styled with these tokens in the component's scoped CSS (no video.js skin); player chrome uses `white`/`black` keywords and tokens, no raw hex. Controls are one row under the scrub bar: play and time on the left; volume (mute button plus a gold-thumb slider styled like the scrub bar), auto-replay and full screen right-aligned. Dragging the slider to 0 mutes and shows the slashed speaker; unmuting restores the last level. The slider is hidden when the controls bar is under 480px wide (container query) and where the browser ignores `video.volume` (iOS Safari); the mute button always shows. Speed and frame-step controls stay hidden behind flags |
| `AnnotationToolbar` | Fabric.js tools: line, arrow, circle, angle, freehand, text, color, undo, redo, clear. Use `ToggleGroup` for the tool set (active `preset-filled-primary-500`), `btn-icon` 48px buttons with `Tooltip`, a color popover, and a divider between tools and history actions. Docked bar under the video on phones; `FloatingPanel` on tablet/desktop. **Proposed** annotation colors (must read on turf, sky and white shirts): gold `#D4A017`, white `#FFFFFF`, red `#B3261E` (`error-500`), navy `#0E2B5C` with white outline, lime `#D9EFA5` for night-time footage. Always draw with a 2px dark halo so strokes stay visible. As built (`packages/ui/src/lib/annotations/AnnotationToolbar.svelte`): plain `btn-icon` buttons with `aria-pressed` (no `ToggleGroup`, `Tooltip` or color popover; the colors are always visible), docked under the video at every width (no `FloatingPanel` yet), plus a "Show for" length select and a Save button; navy gets a white halo; clear is undoable |
| `ChatBubble` | From the profile: incoming `bg-primary-50` (about `#edf3ef`), radius `0 12 12 12`, left; mine `bg-primary-500` white, radius `12 0 12 12`, right; max 85% (95% on phones), padding 16 x 19px, timestamp 12px at 80% opacity, 20px gap between messages, list max height 480px with `scrollbar-gutter: stable`; text uses `overflow-wrap: anywhere` |
| `MetricCard` | 28 to 32px Poppins numeral navy, 13px `surface-600` caption; three across, stacked with number and label on one row on phones |
| `StatusBadge` | Pill, 12 to 13px 600: ready (`success`), processing/pending (`warning`), failed (`error`), neutral (`surface`). Always paired with text or icon, never color alone |
| `EmptyState` | Dashed 1px border (`surface-300`), `surface-100` fill, `rounded-container`, centered copy max 480px, one button |
| `OfflineBanner` | `primary-50` strip, navy 12px text, 44px text button; disables upload and chat |
| `SiteHeader`, `SiteFooter` | Footer `primary-700`, white/75 copy, links white/70 hover `tertiary-300`, logo on white card, Poppins 12.5px uppercase column heads. Footer bottom text at least white/65 (see 11.1). Single source for both apps (marketing and app marketing links) |
| `StepBadge`, `Counter` | Numbered 28 to 30px circle badges, app "counter" with 60px minimum buttons and a 30px figure (practice reps) |

## 11. Layout, responsive rules and accessibility

### 11.1 Layout and breakpoints

Collapse the pages' ten breakpoints to this set (Tailwind defaults plus one custom):

| Name | Min width | Replaces | Behavior |
|---|---|---|---|
| (base) | 0 | | phone, single column |
| `sm` | 640px | 560, 600, 640, 650 | two-column forms and grids, larger brand text |
| `md` | 768px | 700, 760, 860 | three-up cards, row layouts for pathway, app rail nav |
| `lg` | 1024px | 900, 960, 1080, 1100 | two-column heroes and splits, app sidebar |
| `nav` | 1180px | 1180 | desktop marketing nav with dropdowns; below it the hamburger menu |

Rules:

- Mobile first: write base styles for phones, add `sm:` upward. (The profile and planner pages are desktop-first with `max-width` queries; migrate them.)
- Containers: `max-w-site` (1180px) with 22px gutters; reading pages `max-w-reading` (940px); app content `max-w-app` (1400px) with 40px padding at >= lg, 25px at md, 16px on phones.
- Grids: `grid-cols-1` base, `sm:grid-cols-2`, `md:grid-cols-3` (cards 24px gap). Splits use `lg:grid-cols-[1.05fr_0.95fr]` (hero), `[1.2fr_0.8fr]` (assessment), `[0.85fr_1.15fr]` (about, booking). Pricing `md:grid-cols-[1.1fr_0.9fr_0.9fr]`.
- Section rhythm: marketing `py-19` (phones), `py-27` (>= 900px); inner pages `py-14`. Alternate white and `surface-100` backgrounds, with dark navy or green bands for emphasis (booking, pathway, pricing online tiers, CTA).
- App shell: below `md` a top brand bar plus bottom `Navigation layout="bar"`; `md` to `lg` a rail; `lg` and up a 242px sidebar. This extends the profile mock, which switches straight from sidebar to bottom bar at 650px; flagged in Open questions.
- Phone specifics from the profile and planner: content bottom padding `calc(104px + env(safe-area-inset-bottom))` when the bottom bar is shown; sticky form footers; dialogs full-screen at `100dvh`; action rows become full-width stacked buttons (`flex: 1; min-width: 125px`); tab bars do not wrap; inputs 16px.
- Fixed header: the marketing header is `position: fixed`, so hero and anchored sections use `scroll-margin-top: 90px` (planner phones: 92px).
- Never allow horizontal page scroll; tables and the pathway row scroll inside their own wrappers.

### 11.2 Accessibility

Target WCAG 2.2 AA. Contrast ratios below are computed from the hex values (white alpha text composited on the real background).

| Text / UI | On | Ratio | Verdict |
|---|---|---|---|
| Body `#333333` | `#FFFFFF` | 12.6:1 | pass |
| Body `#333333` | `#F6F6F4` | 11.7:1 | pass |
| Headings navy `#0E2B5C` | `#FFFFFF` | 13.8:1 | pass |
| Navy | `#F6F6F4` | 12.8:1 | pass |
| Green `#0B4F3A` (links, icons) | `#FFFFFF` / `#F6F6F4` | 9.6:1 / 8.9:1 | pass |
| White | green `#0B4F3A` | 9.6:1 | pass |
| White | deep green `#08392A` | 12.9:1 | pass |
| White | navy | 13.8:1 | pass |
| Navy | gold `#D4A017` (main CTA) | 5.8:1 | pass |
| Deep green | gold `#D4A017` | 5.4:1 | pass |
| Gold-soft `#E6BF55` | navy / deep green | 7.9:1 / 7.3:1 | pass |
| Gold `#D4A017` | deep green / navy | 5.4:1 / 5.8:1 | pass (gold text on dark only) |
| Gold-soft `#E6BF55` | green `#0B4F3A` | 5.5:1 | pass |
| Muted `#4C5C56` | white / `#F6F6F4` | 7.1:1 / 6.5:1 | pass |
| `#5b5b5b` / `#666` / `#555` | white | 6.8 / 5.7 / 7.5:1 | pass |
| `surface-500` `#69726D` | white / `#F6F6F4` | 5.0:1 / 4.6:1 | pass, lowest allowed text grey |
| Gold-brown `#946d08` | white | 4.7:1 | pass (profile caption) |
| `tertiary-800` `#7B5D0D` | white | 6.2:1 | pass (new eyebrow color on light) |
| White at 92 / 82 / 75 / 70% | deep green | 11.1 / 9.2 / 8.0 / 7.1:1 | pass |
| White at 65% | deep green / navy | 6.4 / 6.7:1 | pass (lowest allowed for secondary text on dark) |
| **Gold `#D4A017`** | **white** | **2.4:1** | **fail** (current `.eyebrow` on light, gold-on-white icons) |
| **Gold** | `#F6F6F4` | **2.2:1** | **fail** |
| **White** | **gold** | **2.4:1** | **fail** (never white text on gold) |
| **`#888`** (`.price-note`, `.location-sub`) | white | **3.5:1** | **fail** |
| **`#999`** (`.form-note`, testimonial role) | white | **2.9:1** | **fail** |
| **White at 45%** (`.footer-bottom`) | deep green | **3.8:1** | **fail** |
| Gold 3px focus outline (profile) | white | **2.4:1** | **fail** as a focus indicator (3:1 needed) |

Fixes applied by this guide: eyebrow on light becomes `tertiary-800`; small grey copy uses `surface-600` or `surface-500`; footer fine print is white/65 or higher; focus ring is navy on light and gold-400 on dark. These make the gold eyebrow look darker on white sections, which is a visible change (Open questions).

Rules:

- **Focus**: visible on every interactive element, 3px, 3px offset, never `outline: 0`. The pages' `outline:none` on form inputs is replaced by the global ring (border color change is an addition, not a replacement).
- **Touch targets**: 48px minimum height and width for buttons, nav items, tabs, links in lists, icon buttons, `summary` rows and dialog close (the profile page's rule). Desktop-only dense controls may go to 44px; never below 24px (WCAG 2.2 minimum).
- **Keyboard**: the hover-only nav dropdown must work with keyboard (use `Menu`). Hamburger gets `aria-label`, `aria-expanded`, `aria-controls`. Dialogs trap focus and return it (Skeleton Dialog does). Toast region is `aria-live`. Tabs and accordions use their Skeleton parts, which carry roles and arrow-key handling.
- **Color alone never carries meaning**: status badges, chart bars, form errors and annotation colors get text, icon or pattern too.
- **Forms**: visible `<label>` for every field (the pages' uppercase micro-labels are fine), helper and error text linked with `aria-describedby`, errors in `error-700` on `error-50` with an icon.
- **Video**: captions track supported in video.js, controls reachable by keyboard, no autoplay with sound, annotation canvas has a text alternative (the annotation list) so coach feedback is not canvas-only.
- **Motion**: honor `prefers-reduced-motion` (global rule). The reveal-on-scroll animation must not hide content when JS or `IntersectionObserver` is unavailable.
- **Language and landmarks**: `lang="en"`, one `<main>`, `<header>`, `<nav aria-label>`, `<footer>`; skip link as first focusable element.

## 12. Practice plan print rules

The planner is used on the range and printed. Keep the print sheet as a shared stylesheet (`.print-plan` or `@media print` in `base.css`) and apply it to any practice plan view in either app. Values are taken from the planner's print block.

- Page: Letter portrait, margins `0.42in 0.46in`; no background colors or shadows; `print-color-adjust: economy`.
- Typeface: Arial / Helvetica 10.5pt, line height 1.35, black `#111` text (printing swaps Inter for a system font on purpose, so printouts do not depend on font loading).
- Show: header (logo wordmark 15pt in `primary-500`, 1.5pt rule), plan title 21pt, summary box with the problem list in two columns, every stage card.
- Hide: nav, steps, forms, questions, action rows, disclosure toggles, drill index, range status bar, buttons, video.
- Stage card: `break-inside: avoid`, 1pt border `#9AA796`, 4pt radius; header 13.5pt title and boxed time chip (1pt `primary-500` border, white fill); core grid two columns (addresses spans both); instructions forced open, detail grid two columns, 8 to 9.5pt text.
- Headings `break-after: avoid`; `orphans: 3; widows: 3` for headings and `2` for paragraphs.
- Plans with four problems break before stage 3 so the sheet fits two pages.
- Stages 4 and 5 hide their long instructions in print to keep it short.
- Links print as plain text; no URLs appended.

```css
@media print {
  @page { size: letter portrait; margin: 0.42in 0.46in; }
  * { box-shadow: none !important; text-shadow: none !important;
      -webkit-print-color-adjust: economy; print-color-adjust: economy; }
  html, body { background: #fff !important; color: #111 !important;
    font: 10.5pt/1.35 Arial, Helvetica, sans-serif !important; overflow: visible !important; }
  .print-hide, nav, [data-print='hide'] { display: none !important; }
  .stage-card { break-inside: avoid; border: 1pt solid #9AA796 !important; border-radius: 4pt !important;
    background: #fff !important; margin: 0 0 5pt !important; }
  .stage-card details > * { display: block !important; }   /* force instructions open */
  h1, h2, h3, h4 { orphans: 3; widows: 3; break-after: avoid; color: var(--color-primary-500) !important; }
}
```

## 13. PWA chrome

Applies to marketing (installable, per the spec) and the app (own scope on `app.` origin).

| Item | Value |
|---|---|
| `<meta name="theme-color">` | `#0B4F3A` light, `#171D1A` dark (two tags with `media`, see section 16.4; replaces the planner's `#172f27`) |
| Manifest `theme_color` | `#0B4F3A` |
| Manifest `background_color` | `#FFFFFF` (splash shows the dark green monogram on white) |
| `name` / `short_name` | "Trey Thornock Golf" / "TT Golf" (**Proposed** short name) |
| `display` | `standalone` |
| Icons | Generated from `images/img-01.png` (only source): 192, 512, maskable 512, Apple touch 180. The monogram is dark green `#0B4F3A`-family on white; for maskable keep the glyph inside the central 80% safe zone on a white field |
| Status bar (iOS) | `apple-mobile-web-app-status-bar-style: default` (a white bar in light, dark bar in dark mode) |
| Offline | Offline banner per 10.2; shell cached, API and media never cached |
| Install prompt | Styled with `preset-filled-tertiary-500` pill, dismissible |

## 14. Do and don't

Do:

- Use tokens (`text-secondary-500`, `bg-primary-700`, `rounded-container`, `shadow-soft`) and Skeleton presets in every component.
- Keep one gold main CTA per view; everything else green or outline.
- Use navy for headings, charcoal `#333` for body, `surface-600` for secondary text.
- Put gold text, gold icons and gold-soft only on dark green or navy; use `tertiary-800` for gold-colored text on white.
- Use the logo on white only.
- Keep photos at 22px radius with gradients for text overlays.
- Give every icon-only button a tooltip and an accessible name.
- Test at 360px width, with 200% zoom and with reduced motion on.

Don't:

- Don't write raw hex or `rgba(...)` in components (the pages do; migration removes it).
- Don't mix serif, Playfair, DM Sans or lime into any screen.
- Don't use white text on gold or gold text on white or `#F6F6F4`.
- Don't use `#888`, `#999` or white below 65% opacity for readable text.
- Don't set `outline: 0` or hide focus.
- Don't use hover as the only way to reveal anything.
- Don't burn annotations into video or rely on color alone to convey status.
- Don't build a custom modal, tabs, accordion, toast, switch or progress bar when Skeleton ships one.
- Don't restyle Skeleton internals with `!important`; override tokens in `theme.css`.
- Don't ship a new shadow, radius or font weight without adding it here first.

## 15. Migration map: existing CSS to Skeleton and tokens

### Marketing (`index.html`, `golf-lessons-durham.html`)

| Existing | Becomes |
|---|---|
| `:root --green / --green-deep / --navy / --gold / --gold-soft / --gray / --gray-warm / --charcoal` | `primary-500` / `primary-700` / `secondary-500` / `tertiary-500` / `tertiary-300` (about `#E6BF55`) / `surface-200` / `surface-100` / `surface-700` |
| `--font-display`, `--font-body` | `font-display`, `font-body` (`--typo-heading`, `--typo-base`) |
| `--radius-lg` 22 / `--radius-md` 16 | `rounded-hero` / `rounded-container` |
| `--shadow-soft`, `--shadow-lift` | `shadow-soft`, `shadow-lift` |
| `.wrap` | `max-w-site mx-auto px-5.5` (`max-w-reading` on the lessons page) |
| `.section-pad`, `.section-head` | `py-19 md:py-27`, `SectionHead` component |
| `.eyebrow`, `.eyebrow.on-dark` | `.eyebrow` class, `.on-dark` ancestor |
| `.btn`, `.btn-gold`, `.btn-green`, `.btn-outline-dark`, `.btn-outline-light`, `.btn-block` | `btn` + `preset-filled-tertiary-500`, `preset-filled-primary-500`, `preset-outlined-secondary-500`, `border-white/55 text-white`, `w-full`; uppercase via `.btn-cta` |
| `header.site-nav`, `.nav-inner`, `.brand`, `.brand-mark`, `.brand-text` | `SiteHeader` on `AppBar` |
| `.nav-item`, `.nav-dropdown`, `.nav-caret` | `Menu` |
| `.hamburger`, `.mobile-menu`, `.mobile-group-title`, `.mobile-sub` | `Dialog` full-screen or `Navigation layout="sidebar"` |
| `.hero`, `.hero-grid`, `.hero-eyebrow`, `.hero-stats`, `.hero-photo`, `.hero-film`, `.contour-bg` | `Hero` component |
| `.philosophy-strip` | `PhilosophyStrip` |
| `.pillar-card`, `.pillar-icon`, `.pillar-num`, `.new-tag` | `PillarCard`, `badge preset-filled-tertiary-500` |
| `.service-card`, `.service-top`, `.service-body`, `.service-list` | `LessonCard` |
| `.junior-card`, `.junior-pathway-step`, `.step-tag`, `.junior-cta` | `LessonCard` junior variant, `card` with 4px top border, `badge preset-tonal-primary` |
| `.pathway-*`, `.progress-track`, `.progress-step` | `Timeline` / `Pathway`; `Steps` for the compact progress row |
| `.exp-card`, `.exp-num` | `card` with `hover:border-tertiary-500`, Poppins 34px numeral in `surface-200` turning gold on hover |
| `.testimonial-card`, `.quote-mark`, `.testimonial-avatar` | `card`, `Avatar` |
| `.faq-item`, `summary` | `Accordion` |
| `.price-card`, `.price-tag`, `.price-list`, `.price-tab-btn`, `.price-tab-panel` | `PriceCard`, `PriceList`, `Tabs` |
| `.uskids-box`, `.uskids-badge` | `PriceCard` featured variant, `badge preset-filled-tertiary-300` |
| `.online-tier`, `.online-tier-tag` | `card` on dark (`bg-white/5 border-white/20`), `badge` |
| `.booking-section`, `.booking-form`, `.form-field`, `.form-grid`, `.form-success` | navy section, `card rounded-hero`, `label` + `input`/`select`/`textarea`, `card preset-tonal-success` |
| `.contact-card`, `.icon-badge`, `.location-card`, `.location-tag` | `card`, icon tile, `badge` |
| `.newsletter-cta-card` | `card` on dark |
| `.placeholder-box`, `.price-card.placeholder-card` | dashed `card` (to be removed with the placeholder copy) |
| `footer`, `.footer-grid`, `.footer-logo-card` | `SiteFooter` |
| `.reveal` / `.reveal.in` | one `reveal` action/attachment in `packages/ui`, once per element, reduced-motion safe |
| `.cta-band`, `.step-list`, `.card` (lessons page) | navy/deep green band, `Steps` or numbered list with `primary-500` 30px circles, `card preset-filled-surface-100` |
| `a.home-link`, `.nav-cta` | `btn-sm` ghost link, `btn-sm preset-filled-tertiary-500` |

### Profile (`user-profile.html`, final CSS block wins)

| Existing | Becomes |
|---|---|
| `--green / --dark / --paper / --ink / --muted / --line / --navy / --gold` | `primary-500` / `primary-700` / `surface-100` / `surface-700` / `surface-600` / `surface-200` / `secondary-500` / `tertiary-500` |
| `--lime` (reassigned to gold) | removed; use `tertiary-500` |
| `.layout`, `aside`, `.nav button`, `.nav button.active`, `.coach` | app shell with `Navigation layout="sidebar"`, `Navigation.Trigger` active state, coach block in `Navigation.Footer` |
| `#bottomNav` | `Navigation layout="bar"` |
| `.top`, `.banner` | `AppBar`, `OfflineBanner` |
| `.head`, `.actions`, `.row`, `.stack`, `.grid` | Tailwind flex/grid utilities |
| `.card`, `.feature`, `.access`, `.empty` | `card`, hero-style `card bg-primary-700` with gold-soft eyebrow, `card preset-tonal-surface`, `EmptyState` |
| `.btn`, `.btn.light`, `.btn.outline`, `.btn.small`, `.btn.wide` | `btn preset-filled-primary-500`, `preset-filled-tertiary-500`, `preset-outlined-primary-500`, `btn-sm`, `w-full` |
| `.tag`, `.tag.gold`, `.status` | `badge preset-tonal-primary`, `badge preset-tonal-tertiary`, `StatusBadge` |
| `.tabs`, `.journey-tabs` | `Tabs` (pill) or `SegmentedControl` |
| `.metric-grid`, `.metric` | `MetricCard` |
| `.phase`, `.phase.current` | `Timeline` |
| `.bar`, `.bar i` | `Progress` |
| `.chart`, `.chart-col` | chart component with `primary-500` bars, 5px top radius (`dataviz` guidance applies) |
| `.bubble`, `.bubble.mine`, `.messages`, `.chat` | `ChatBubble` |
| `.video`, `.video-grid` | `VideoPlayerChrome`, 2-col grid collapsing to 1 |
| `table`, `th`, `td`, `.table-wrap` | `table` + `table-wrap` |
| `.field`, `input`, `select`, `textarea`, `.two`, `.full`, `.helper`, `.check` | `label`, `input` etc., `grid sm:grid-cols-2`, `col-span-full`, helper text, `checkbox` |
| `dialog`, `dialog .close`, `.form-footer` | `Dialog`; sticky footer inside `Dialog.Content` |
| `.toast` | `Toast` |
| `.journal-entry`, `summary` | `Accordion` or Disclosures |
| `.counter`, `.drill-copy`, `.session-card`, `.menu-card` | `Counter`, 21px readable drill copy, `card` (780px max), `card` button variant |
| `.avatar` | `Avatar` |
| `.generator-offer`, `.generator-workspace` | `card bg-primary-700` feature, `card border-t-4 border-tertiary-500` |

### Planner (`index-trey-website.html`)

| Existing | Becomes |
|---|---|
| `--green #18372b`, `--green2`, `--lime`, `--sage`, `--gold #b29058`, `--paper`, `--line` | `primary-500`, `primary-600`, (removed), `primary-50`, `tertiary-500`, `surface-100`, `surface-200` |
| Playfair Display headings, DM Sans body | Poppins and Inter (type scale in section 7) |
| `.top`, `.logo`, `.lib` | `AppBar`, brand lockup |
| `.steps`, `.step`, `.connector` | `Steps` |
| `.panel`, `.describe`, `.question`, `.coach-msg` | `card`, `card preset-tonal-surface`, `card`, quote block with 3px `primary-300` left rule |
| `.btn`, `.ghost`, `.link` | `btn preset-filled-primary-500`, `btn preset-outlined-surface-300-700`, `btn` anchor style; make them pills |
| `.chip`, `.chip.selected`, `.answer`, `.answers` | `chip` toggle / `ToggleGroup` / `SegmentedControl`; 46px min height |
| `.issue-card`, `.priority-row`, `.priority-badge`, `.badge-primary/secondary/support` | `card`, row with `StatusBadge`-style tonal badges (primary, secondary, tertiary) |
| `.stage-card`, `.stage-head`, `.stage-index`, `.stage-time`, `.stage-core`, `.stage-instructions` | `PracticePlanSection` |
| `.minute-row`, `.minute-number`, `.minute-phase` | `table`-like list in `PracticePlanSection`, zebra via `table-zebra` |
| `.range-status` (phones) | sticky bar in `PracticePlanSection` |
| `@media print` block | section 12 |
| `<meta theme-color #172f27>` | `#0B4F3A` |

## 16. Dark mode

Decided 2026-10-12: dark mode ships at launch for marketing and app, and **follows the user's OS setting** (`prefers-color-scheme`). There is no toggle at launch; a Light / System / Dark override can be added later in app settings.

### 16.1 Mechanism

- Skeleton v5's default dark strategy is `media`, so no config is needed. Do not force `color-scheme: light`. Set `color-scheme: light dark` on `:root` so native controls and scrollbars follow.
- Prefer Skeleton's paired tokens (`bg-surface-50-950`, `text-surface-700-100`, `preset-*`), which use `light-dark()`. Avoid hard-coded `#fff` or `#333`, and avoid raw `dark:` utilities unless a pairing cannot express the rule.
- The theme in section 6 already defines the dark halves (`--color-root-bg-dark`, `--typo-*--color-dark`, `--color-brand-dark`). Section 16.2 lists the rules the pairings alone do not cover.

### 16.2 Rules

| Area | Light | Dark |
|---|---|---|
| Page background | `surface-50` | `surface-950` `#0E1311` |
| Cards, app bar, dialogs | white / `surface-100` | `surface-900` `#171D1A`; raised (menus, popovers) `surface-800` |
| Body text | `surface-700` | `surface-100` |
| Muted text | `surface-600` | `surface-400` |
| Headings | navy `secondary-500` | `secondary-100` |
| Links | `primary-500` | `primary-200` (`primary-300` only on the page background) |
| Eyebrow | `tertiary-800` | `tertiary-400` |
| Filled primary button | `primary-500`, white text | `primary-400`, white text (the 500 fill would nearly vanish on the dark background) |
| Gold main CTA | gold fill, navy text | unchanged |
| Outline secondary button | navy outline | `surface-300` outline and text |
| Input and divider borders | `surface-300` | inputs `surface-500`; dividers `surface-600` |
| Focus ring | navy | gold `tertiary-400` (already set for `.on-dark`; apply it under `prefers-color-scheme: dark` too) |
| Elevation | shadows | borders (1px `surface-700`) instead of shadows; `shadow-hero` stays |
| Green / navy marketing bands | as designed | stay as designed, add a 1px `white/12` top and bottom border so they separate from the dark page |
| Logo | on white | in a white tile (16px radius, 6px padding), the same treatment the footer already uses |
| Photos | unchanged | unchanged, no filter |
| Video player, Fabric canvas | always dark chrome over black | same in both modes; annotation colors do not change |
| Charts, progress bars | `primary-500` | `primary-300` or `primary-400` |
| Print (practice plans) | light | always light: `@media print { :root { color-scheme: light; } }` |

### 16.3 Contrast in dark mode (computed)

| Text / UI | On page `#0E1311` | On card `#171D1A` | Verdict |
|---|---|---|---|
| Body `surface-100` `#F6F6F4` | 17.3:1 | 15.8:1 | pass |
| Muted `surface-400` `#A3AAA6` | 7.9:1 | 7.2:1 | pass |
| Heading `secondary-100` `#D4D9E2` | 13.2:1 | 12.1:1 | pass |
| Link `primary-200` `#AAC1BA` | 9.9:1 | 9.0:1 | pass |
| Link `primary-300` `#799E93` | 6.4:1 | 5.8:1 | pass |
| Eyebrow `tertiary-400` `#DDB54A` | 9.6:1 | 8.8:1 | pass |
| Error text `error-300` `#D58883` | 6.9:1 | 6.3:1 | pass |
| Success text `success-300` `#8CB89E` | 8.5:1 | 7.7:1 | pass |
| Warning text `warning-300` `#D7B584` | 9.7:1 | 8.8:1 | pass |
| Gold CTA fill `#D4A017` (UI edge) | 7.9:1 | 7.2:1 | pass |
| `primary-400` fill `#417665` (UI edge) | 3.6:1 | 3.3:1 | pass (3:1 for UI), white text on it 5.2:1 |
| Input border `surface-500` `#69726D` | 3.8:1 | 3.4:1 | pass (3:1 for UI) |
| `primary-500` `#0B4F3A` as an edge | 2.0:1 | 1.8:1 | **fail**: do not use as a button or border color in dark mode |
| Divider `surface-600` `#4C5C56` | 2.7:1 | 2.4:1 | decorative only |
| Navy gold-CTA label (navy on gold) | 5.8:1 | | pass |
| White on app bar `#171D1A` | | 17.1:1 | pass |

### 16.4 PWA and testing

- Use two theme-color tags: `<meta name="theme-color" content="#0B4F3A" media="(prefers-color-scheme: light)">` and `<meta name="theme-color" content="#171D1A" media="(prefers-color-scheme: dark)">`. The manifest `theme_color` stays `#0B4F3A` because manifests cannot vary by scheme. Manifest `background_color` stays `#FFFFFF` (the splash screen flashes white in dark mode; accepted).
- Playwright component and e2e runs must cover both `colorScheme: 'light'` and `'dark'`. Contrast checks run in both.
- Every new component is reviewed in dark mode before merge.

## Marketing implementation notes (2026-10-12)

- Skeleton v5 ships `.btn` and the `preset-*` classes in Tailwind's `utilities` layer, so brand overrides in `packages/ui` live in `@layer utilities` (a `components` layer rule loses).
- `apps/marketing/src/lib/styles/tokens.css` keeps the legacy variable names and adds OS-following surface tokens (`--page-bg`, `--alt-bg`, `--card-bg`, `--text`, `--text-muted`, `--heading`, `--eyebrow`, `--link`, ...) using `light-dark()`, plus `--green-fill` (primary-500 in light, primary-400 in dark) for filled green controls.
- Marketing buttons are `Button.svelte`; classes Skeleton defines globally (`btn`, `card`, `chip`, `badge`, `input`, ...) must not be reused for custom markup.

## Open questions

1. **Palette confirmation.** DECIDED: green `#0B4F3A`, navy `#0E2B5C`, gold `#D4A017`, Poppins and Inter; `CLAUDE.md` and the spec are fixed.
2. **Semantic colors.** DECIDED: success `#2E7D4F`, warning `#B7791F`, error `#B3261E`.
3. **Contrast fixes visible to users.** DECIDED: accept all (gold-brown eyebrows `#7B5D0D`, darker greys, lighter footer fine print, navy focus ring on light).
4. **Dark mode.** DECIDED (2026-10-12): ships at launch and follows the OS setting. See section 16.
5. **Button text case.** DECIDED: sentence case by default; uppercase (`.btn-cta`) only for marketing hero and booking CTAs.
6. **App navigation breakpoints.** DECIDED: bottom bar below 768px, rail 768 to 1023, sidebar from 1024.
7. **Package scope.** DECIDED: `@ttg/ui` and `@ttg/shared` for now (workspace only, nothing is published); rename later with one find-and-replace.
8. **Logo variants.** DEFERRED: not needed now. Use the existing `img-01.png` (in a white tile in dark mode).
9. **Annotation color set.** DECIDED: use the proposed five-color set as the default; show Trey once the toolbar exists and check the colors on real swing footage in both modes.
10. **Corner style.** DECIDED: `round` corners.
11. **Self-hosting fonts.** DECIDED: self-host fonts with Fontsource; confirm package names at install.
12. **Skeleton sub-component names** NO DECISION NEEDED: check each component's prop names against the Skeleton docs on first use.
13. **Navigation dropdown behavior.** DECIDED: click and keyboard `Menu` dropdowns instead of hover.
14. **Short name for PWA.** DECIDED: "TT Golf".
