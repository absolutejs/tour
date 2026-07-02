import type { TourActionArgs, TourActionRef, TourStep } from "./types";

// Steps are serializable JSON (they live in a DB / admin editor), so a step
// can't hold a function — it holds an action NAME. The registry maps names to
// handlers: the package ships a few generic built-ins (click / wait / scroll)
// and the host app registers anything product-specific ("matches.demo-swipe",
// …). Like the controller it's a keyed singleton, so the page that OWNS a
// surface can register its demo handler while the tour overlay — mounted in a
// completely different part of the tree — resolves it by name.

/** Everything a handler gets: the step, its resolved target element, the raw
 *  args from the serialized ref, tour navigation, and an AbortSignal that
 *  fires when the step changes or the tour stops mid-run. */
export type TourActionContext = {
	args: TourActionArgs;
	back: () => void;
	index: number;
	next: () => void;
	signal: AbortSignal;
	step: TourStep;
	stop: () => void;
	target: Element | null;
};

export type TourActionHandler = (
	context: TourActionContext,
) => void | Promise<void>;

export type TourActionRegistry = {
	/** Register one handler. Returns an unregister function — call it on
	 *  unmount so a dead page's handler can't be resolved. */
	register: (name: string, handler: TourActionHandler) => () => void;
	/** Register several handlers at once; the return unregisters them all. */
	registerAll: (
		handlers: Record<string, TourActionHandler>,
	) => () => void;
	resolve: (name: string) => TourActionHandler | undefined;
};

const registries = new Map<string, TourActionRegistry>();

export const useTourActions = (
	registryKey = "absolute.tour",
): TourActionRegistry => {
	const existing = registries.get(registryKey);
	if (existing) return existing;

	const handlers = new Map<string, TourActionHandler>();

	const register = (name: string, handler: TourActionHandler) => {
		handlers.set(name, handler);

		return () => {
			// Only remove if it's still OUR handler — a remount may have
			// re-registered before the old unmount cleanup ran.
			if (handlers.get(name) === handler) handlers.delete(name);
		};
	};

	const registry: TourActionRegistry = {
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

/** Abortable sleep — resolves early (never rejects) when the signal fires. */
export const tourWait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		if (signal.aborted) {
			resolve();

			return;
		}
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		function onAbort() {
			clearTimeout(timer);
			resolve();
		}
		signal.addEventListener("abort", onAbort, { once: true });
	});

const DEFAULT_WAIT_MS = 600;

// Generic built-ins so simple demos (click a tab, pause, scroll a panel into
// view) work straight from admin-authored JSON with no host code at all.
const builtinActions: Record<string, TourActionHandler> = {
	click: (context) => {
		const selector =
			typeof context.args.selector === "string"
				? context.args.selector
				: null;
		const el = selector
			? document.querySelector(selector)
			: context.target;
		if (el instanceof HTMLElement) el.click();
	},
	scroll: (context) => {
		const selector =
			typeof context.args.selector === "string"
				? context.args.selector
				: null;
		const el = selector
			? document.querySelector(selector)
			: context.target;
		el?.scrollIntoView({
			behavior: "smooth",
			block: context.args.block === "start" ? "start" : "center",
			inline: "nearest",
		});
	},
	wait: (context) =>
		tourWait(
			typeof context.args.ms === "number"
				? context.args.ms
				: DEFAULT_WAIT_MS,
			context.signal,
		),
};

/**
 * Run a step's serialized action refs in order. Unknown names warn and skip
 * (a tutorial authored against a page that isn't mounted must degrade, not
 * break the tour); handler errors are contained the same way. Stops cleanly
 * as soon as the signal aborts.
 */
export const runTourActions = async (
	refs: TourActionRef[] | undefined,
	registry: TourActionRegistry,
	context: Omit<TourActionContext, "args">,
	hooks?: { onError?: (ref: TourActionRef, err: unknown) => void },
) => {
	if (!refs || refs.length === 0) return;
	for (const ref of refs) {
		if (context.signal.aborted) return;
		if (ref.delayMs) await tourWait(ref.delayMs, context.signal);
		if (context.signal.aborted) return;
		const handler =
			registry.resolve(ref.action) ?? builtinActions[ref.action];
		if (!handler) {
			console.warn(`[tour] unknown action "${ref.action}"`);
			hooks?.onError?.(ref, new Error("unknown action"));
			continue;
		}
		try {
			await handler({ ...context, args: ref.args ?? {} });
		} catch (err) {
			console.warn(`[tour] action "${ref.action}" failed`, err);
			hooks?.onError?.(ref, err);
		}
	}
};
