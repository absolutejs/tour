// The tour "protocol": a serializable description of a guided walkthrough. It is
// intentionally plain JSON so a tour can live in code, in a database, or be
// authored in an admin UI and rendered by the same engine.

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export type TourMediaKind = "image" | "video";

/** A visual shown in the step's card — a screenshot, GIF, or short clip. */
export type TourMedia = {
	kind: TourMediaKind;
	url: string;
	alt?: string;
};

/** How the step advances. "button" (default) = Next; "target-click" = the user
 *  must click the highlighted element (interactive walkthroughs); "timer" =
 *  auto-advance after `delayMs`. */
export type TourAdvanceOn = "button" | "target-click" | "timer";

export type TourAdvance = {
	on?: TourAdvanceOn;
	delayMs?: number;
};

export type TourSpotlightShape = "rect" | "circle";

export type TourSpotlight = {
	/** Extra space between the element and the ring (px). Default 6. */
	padding?: number;
	/** Corner radius of the cutout (px). Default 12; ignored for circle. */
	radius?: number;
	shape?: TourSpotlightShape;
	/** Let clicks reach the highlighted element instead of blocking the page —
	 *  needed for "click this to continue" steps. */
	allowInteraction?: boolean;
};

/** Arguments carried by a serialized action reference — plain JSON scalars so
 *  the whole tutorial stays storable/authorable. */
export type TourActionArgValue = string | number | boolean | null;

export type TourActionArgs = Record<string, TourActionArgValue>;

/**
 * A serializable reference to an action the engine runs when a step is entered
 * or left. `action` names either a built-in ("click" | "wait" | "scroll") or a
 * handler the host app registered on its TourActionRegistry — this is how a
 * tour DEMONSTRATES the product (e.g. auto-swiping a card) instead of just
 * pointing at it.
 */
export type TourActionRef = {
	action: string;
	args?: TourActionArgs;
	/** Wait this long (ms) before running this action. */
	delayMs?: number;
};

/** How a tutorial resolves data-backed surfaces while it plays: "auto" shows
 *  the viewer's real data when they have it and the host's typed demo data
 *  when they don't; "demo" / "live" force one side. */
export type TourDataMode = "auto" | "demo" | "live";

/**
 * A serializable predicate reference — `condition` names either a built-in
 * ("element" | "media") or a predicate the host registered on its
 * TourConditionRegistry. Powers step branching (showIf/skipIf), waitFor, and
 * trigger audience rules, all from plain JSON.
 */
export type TourConditionRef = {
	condition: string;
	args?: TourActionArgs;
};

/** Hold a step until the app is ready for it: a selector that must exist, or
 *  a registered condition that must return true. Past `timeoutMs` (default
 *  3500) the step shows anyway rather than stalling the tour. */
export type TourWaitFor = {
	selector?: string;
	condition?: TourConditionRef;
	timeoutMs?: number;
};

/** Small-screen overrides for a step — swap the target/placement/copy, or
 *  skip the step entirely where its anchor doesn't exist (a collapsed
 *  toolbar, a desktop-only panel). */
export type TourStepMobile = {
	target?: string;
	placement?: TourPlacement;
	title?: string;
	body?: string;
	skip?: boolean;
};

/** A call-to-action button in the step card ("Try it now") — runs action refs
 *  through the same registry as onEnter, then advances unless advance:false. */
export type TourCta = {
	label: string;
	actions?: TourActionRef[];
	advance?: boolean;
};

export type TourTransitionKind = "fade" | "slide" | "scale" | "none";

export type TourTransition = {
	kind?: TourTransitionKind;
	durationMs?: number;
};

export type TourStep = {
	/**
	 * CSS selector for the element to spotlight. Omit it (or if it can't be
	 * found) and the step renders as a centered card instead — ideal for the
	 * welcome / closing steps.
	 */
	target?: string;
	/**
	 * Navigate here before showing the step, for cross-page tours. The engine
	 * waits for the page (and the target) to render before positioning.
	 */
	route?: string;
	/**
	 * Preferred side for the tooltip relative to the target. The engine flips
	 * and clamps it to stay on screen. "center" is the no-target card.
	 */
	placement?: TourPlacement;
	title: string;
	body: string;
	/** Optional image / video shown in the card. */
	media?: TourMedia;
	/** Per-step spotlight tuning (padding, radius, shape, click-through). */
	spotlight?: TourSpotlight;
	/** How this step advances (button / click target / auto timer). */
	advance?: TourAdvance;
	/** Entrance animation for the card. */
	transition?: TourTransition;
	/** Show a pulsing hint dot on the target instead of a heavy spotlight. */
	beacon?: boolean;
	/** Actions to run once the step is positioned (demos, clicks, waits). They
	 *  run sequentially and are cancelled if the step changes mid-run. */
	onEnter?: TourActionRef[];
	/** Actions to run when leaving the step (cleanup / restore). */
	onExit?: TourActionRef[];
	/** Every predicate must hold or the step is skipped (in the direction of
	 *  travel). */
	showIf?: TourConditionRef[];
	/** Any predicate holding skips the step. */
	skipIf?: TourConditionRef[];
	/** Hold the step until the app is ready for it (selector / condition). */
	waitFor?: TourWaitFor;
	/** Small-screen target/placement/copy overrides, or skip on mobile. */
	mobile?: TourStepMobile;
	/** Optional call-to-action button rendered in the card. */
	cta?: TourCta;
};

export type TourTrigger = {
	/** Auto-play once per viewer, on their first visit. */
	firstVisitOnly?: boolean;
	/** Only auto-play when the current path starts with this prefix. */
	onRoutePrefix?: string;
	/** Restrict auto-play to these role slugs (the host app decides how). */
	roles?: string[];
	/** Stop auto-playing after the viewer has skipped it this many times
	 *  (useTourGate; default 2). They can still replay manually. */
	maxDismissals?: number;
	/** Auto-play at most once per browser session. */
	oncePerSession?: boolean;
	/** When several tutorials match a page, the highest priority wins. */
	priority?: number;
	/** Audience predicates — all must hold for auto-play (useTourGate). */
	showIf?: TourConditionRef[];
};

/** Per-tutorial look. The engine exposes these as CSS custom properties so the
 *  host view can theme each tutorial independently. */
export type TourTheme = {
	accent?: string;
	accentText?: string;
	surface?: string;
	textColor?: string;
	/** Card corner radius, e.g. "14px". */
	radius?: string;
	/** Backdrop dim, 0–1. Default 0.62. */
	dimOpacity?: number;
};

export type Tutorial = {
	id?: string;
	slug?: string;
	name?: string;
	description?: string;
	/** When the tour should auto-play. Manual replays ignore this. */
	trigger?: TourTrigger;
	/** Per-tutorial theming. */
	theme?: TourTheme;
	/** How data-backed surfaces resolve while this tutorial plays (see
	 *  TourDataMode / useTourDemo). Default "auto". */
	dataMode?: TourDataMode;
	steps: TourStep[];
};
