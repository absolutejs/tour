// Structured funnel events, so a host can SEE how its tutorials perform
// instead of guessing: where viewers bail (tour_skipped carries the exact
// step + route + target — the screen where they'd had enough), which anchors
// went missing, which actions failed. The engine emits; the host sinks them
// into whatever analytics it runs.

export type TourEventName =
	| "tour_started"
	| "step_viewed"
	| "step_completed"
	| "step_target_missing"
	| "action_failed"
	| "tour_completed"
	| "tour_skipped";

export type TourEvent = {
	/** ISO timestamp. */
	at: string;
	isReplay: boolean;
	name: TourEventName;
	/** Stable identity for one tour attempt, preserved across page changes. */
	runId: string;
	/** For tour_skipped: how ("skip" button vs "escape"). For action_failed:
	 *  the action name. For tour_completed: "remaining-skipped" when the tail
	 *  of the tour was branch-skipped. */
	reason?: string;
	/** window.location.pathname when the event fired — for a skip, the SCREEN
	 *  the viewer was on when they'd had enough. */
	route?: string;
	stepCount: number;
	stepIndex: number;
	stepTitle?: string;
	/** The step's target selector (post mobile-override resolution). */
	target?: string;
	/** The tutorial identity the host is playing (slug/id), so events from
	 *  different tutorials don't blur together. */
	tutorialSlug?: string;
};

export type TourEventSink = (event: TourEvent) => void;
