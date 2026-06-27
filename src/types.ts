// The tour "protocol": a serializable description of a guided walkthrough. It is
// intentionally plain JSON so a tour can live in code, in a database, or be
// authored in an admin UI and rendered by the same engine.

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

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
};

export type TourTrigger = {
	/** Auto-play once per viewer, on their first visit. */
	firstVisitOnly?: boolean;
	/** Only auto-play when the current path starts with this prefix. */
	onRoutePrefix?: string;
	/** Restrict auto-play to these role slugs (the host app decides how). */
	roles?: string[];
};

export type Tutorial = {
	id?: string;
	slug?: string;
	name?: string;
	description?: string;
	/** When the tour should auto-play. Manual replays ignore this. */
	trigger?: TourTrigger;
	steps: TourStep[];
};
