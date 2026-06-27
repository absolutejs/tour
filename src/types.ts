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
};

export type TourTrigger = {
	/** Auto-play once per viewer, on their first visit. */
	firstVisitOnly?: boolean;
	/** Only auto-play when the current path starts with this prefix. */
	onRoutePrefix?: string;
	/** Restrict auto-play to these role slugs (the host app decides how). */
	roles?: string[];
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
	steps: TourStep[];
};
