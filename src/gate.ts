import type { Tutorial } from "./types";
import {
	evaluateTourCondition,
	useTourConditions,
	type TourConditionRegistry,
} from "./conditions";

// The auto-play decision, centralized. Home-grown tours always break here
// first: one "seen" flag can't express "stop nagging after two skips",
// "at most once per session", or "when three tutorials match this page,
// play the important one". The gate owns that bookkeeping (localStorage —
// dismissals must survive sessions) and evaluates the trigger rules; the
// host just asks pick() and records what happened.

export type TourGateState = {
	completedAt: string | null;
	dismissals: number;
	lastAutoPlayAt: string | null;
};

export type TourGateOptions = {
	/** Namespace for persistence. Default "absolute.tour". */
	storageKey?: string;
	/** Registry for trigger showIf predicates. Defaults to the shared one. */
	conditions?: TourConditionRegistry;
	/** Current viewer's role slugs, matched against trigger.roles (a trigger
	 *  with roles auto-plays only when at least one matches). Omitted →
	 *  role rules are ignored. */
	roles?: () => string[];
};

const DEFAULT_MAX_DISMISSALS = 2;

const EMPTY_STATE: TourGateState = {
	completedAt: null,
	dismissals: 0,
	lastAutoPlayAt: null,
};

const isGateState = (value: unknown): value is TourGateState => {
	if (typeof value !== "object" || value === null) return false;

	return "dismissals" in value && typeof value.dismissals === "number";
};

export const useTourGate = (options?: TourGateOptions) => {
	const storageKey = options?.storageKey ?? "absolute.tour";
	const conditions = options?.conditions ?? useTourConditions();

	const local = () =>
		typeof localStorage === "undefined" ? null : localStorage;
	const session = () =>
		typeof sessionStorage === "undefined" ? null : sessionStorage;

	const slugOf = (tutorial: Tutorial) =>
		tutorial.slug ?? tutorial.id ?? "default";

	const stateFor = (slug: string): TourGateState => {
		const raw = local()?.getItem(`${storageKey}.gate.${slug}`);
		if (!raw) return { ...EMPTY_STATE };
		try {
			const parsed: unknown = JSON.parse(raw);

			return isGateState(parsed) ? parsed : { ...EMPTY_STATE };
		} catch {
			return { ...EMPTY_STATE };
		}
	};

	const write = (slug: string, state: TourGateState) => {
		try {
			local()?.setItem(
				`${storageKey}.gate.${slug}`,
				JSON.stringify(state),
			);
		} catch (err) {
			console.warn("[tour] gate persist failed", err);
		}
	};

	const playedThisSession = (slug: string) =>
		session()?.getItem(`${storageKey}.gate.${slug}.session`) === "1";

	/** Should this tutorial auto-play on this route, for this viewer, now?
	 *  Manual replays bypass the gate entirely — this is auto-play only. */
	const shouldAutoPlay = (tutorial: Tutorial, routePath: string) => {
		const trigger = tutorial.trigger;
		if (!trigger) return false;
		if (
			trigger.onRoutePrefix &&
			!routePath.startsWith(trigger.onRoutePrefix)
		) {
			return false;
		}
		if (trigger.roles?.length && options?.roles) {
			const viewerRoles = options.roles();
			if (!trigger.roles.some((role) => viewerRoles.includes(role))) {
				return false;
			}
		}
		if (
			trigger.showIf &&
			!trigger.showIf.every((condition) =>
				evaluateTourCondition(condition, conditions),
			)
		) {
			return false;
		}
		const slug = slugOf(tutorial);
		const state = stateFor(slug);
		if (
			state.dismissals >=
			(trigger.maxDismissals ?? DEFAULT_MAX_DISMISSALS)
		) {
			return false;
		}
		if (
			trigger.firstVisitOnly &&
			(state.completedAt || state.lastAutoPlayAt)
		) {
			return false;
		}
		if (trigger.oncePerSession && playedThisSession(slug)) return false;

		return true;
	};

	/** The one tutorial to auto-play now: eligible candidates, highest
	 *  trigger.priority wins (stable on ties). */
	const pick = (tutorials: Tutorial[], routePath: string) => {
		const eligible = tutorials.filter((tutorial) =>
			shouldAutoPlay(tutorial, routePath),
		);
		if (eligible.length === 0) return null;

		return eligible.reduce((best, candidate) =>
			(candidate.trigger?.priority ?? 0) > (best.trigger?.priority ?? 0)
				? candidate
				: best,
		);
	};

	/** Stamp that an auto-play actually started (session + last-played). */
	const recordAutoPlay = (slug: string) => {
		const state = stateFor(slug);
		write(slug, { ...state, lastAutoPlayAt: new Date().toISOString() });
		try {
			session()?.setItem(`${storageKey}.gate.${slug}.session`, "1");
		} catch (err) {
			console.warn("[tour] gate persist failed", err);
		}
	};

	/** The viewer skipped out — counts toward maxDismissals. */
	const recordDismissal = (slug: string) => {
		const state = stateFor(slug);
		write(slug, { ...state, dismissals: state.dismissals + 1 });
	};

	/** The viewer finished the tour. */
	const recordCompletion = (slug: string) => {
		const state = stateFor(slug);
		write(slug, { ...state, completedAt: new Date().toISOString() });
	};

	const reset = (slug: string) => {
		local()?.removeItem(`${storageKey}.gate.${slug}`);
		session()?.removeItem(`${storageKey}.gate.${slug}.session`);
	};

	return {
		pick,
		recordAutoPlay,
		recordCompletion,
		recordDismissal,
		reset,
		shouldAutoPlay,
		stateFor,
	};
};

export type TourGate = ReturnType<typeof useTourGate>;
