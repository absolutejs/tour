import type { TourActionArgs, TourConditionRef } from "./types";

// Serializable predicates, mirroring the action registry: a step (or a
// trigger rule) references a condition BY NAME; the host registers the
// predicate. Built-ins cover the DOM-shaped checks ("element" exists,
// "media" query matches); anything product-shaped ("hasMatches",
// "isSubscribed") comes from the host.

export type TourConditionHandler = (args: TourActionArgs) => boolean;

export type TourConditionRegistry = {
	register: (name: string, handler: TourConditionHandler) => () => void;
	registerAll: (
		handlers: Record<string, TourConditionHandler>,
	) => () => void;
	resolve: (name: string) => TourConditionHandler | undefined;
};

const registries = new Map<string, TourConditionRegistry>();

export const useTourConditions = (
	registryKey = "absolute.tour",
): TourConditionRegistry => {
	const existing = registries.get(registryKey);
	if (existing) return existing;

	const handlers = new Map<string, TourConditionHandler>();

	const register = (name: string, handler: TourConditionHandler) => {
		handlers.set(name, handler);

		return () => {
			if (handlers.get(name) === handler) handlers.delete(name);
		};
	};

	const registry: TourConditionRegistry = {
		register,
		registerAll: (map) => {
			const disposers = Object.entries(map).map(([name, handler]) =>
				register(name, handler),
			);

			return () => disposers.forEach((dispose) => dispose());
		},
		resolve: (name) => handlers.get(name),
	};
	registries.set(registryKey, registry);

	return registry;
};

const builtinConditions: Record<string, TourConditionHandler> = {
	element: (args) =>
		typeof args.selector === "string" &&
		document.querySelector(args.selector) !== null,
	media: (args) =>
		typeof args.query === "string" &&
		window.matchMedia(args.query).matches,
};

/** Evaluate one serialized ref. Unknown names warn and count as FALSE — so a
 *  showIf on a missing predicate hides rather than breaks, and a skipIf on
 *  one doesn't skip. */
export const evaluateTourCondition = (
	ref: TourConditionRef,
	registry: TourConditionRegistry,
) => {
	const handler =
		registry.resolve(ref.condition) ?? builtinConditions[ref.condition];
	if (!handler) {
		console.warn(`[tour] unknown condition "${ref.condition}"`);

		return false;
	}
	try {
		return handler(ref.args ?? {});
	} catch (err) {
		console.warn(`[tour] condition "${ref.condition}" failed`, err);

		return false;
	}
};

const CONDITION_POLL_MS = 120;

/** Poll a serialized condition until it holds or the timeout passes —
 *  resolves true when met, false on timeout (the caller proceeds anyway). */
export const waitForTourCondition = (
	ref: TourConditionRef,
	registry: TourConditionRegistry,
	timeoutMs: number,
) =>
	new Promise<boolean>((resolve) => {
		const deadline = Date.now() + timeoutMs;
		const tick = () => {
			if (evaluateTourCondition(ref, registry)) {
				resolve(true);

				return;
			}
			if (Date.now() > deadline) {
				resolve(false);

				return;
			}
			setTimeout(tick, CONDITION_POLL_MS);
		};
		tick();
	});
