import { ref, watch, type Ref } from "vue";

// A tour walks ACROSS pages, and in an MPA each page is its own app mount — so
// moving between steps is a full page reload that would otherwise wipe progress.
// The controller persists {active, index, isReplay, runId} in sessionStorage
// (one key per field, no JSON) so the tour resumes on the next page at the
// right step without fragmenting one analytics run.
// It's a singleton per storage key, so the overlay component and any "replay"
// button elsewhere in the app share one switch.

export type TourController = {
	active: Ref<boolean>;
	index: Ref<number>;
	/**
	 * True when the run is an explicit replay, so the host can choose NOT to
	 * re-stamp its "seen" marker on finish (only the first-visit run should).
	 */
	isReplay: Ref<boolean>;
	/** Stable identity for one start-to-close attempt, including cross-page steps. */
	runId: Ref<string>;
	start: (replay?: boolean) => void;
	stop: () => void;
};

const registry = new Map<string, TourController>();

const newRunId = () => crypto.randomUUID();

export const useTourController = (
	storageKey = "absolute.tour",
): TourController => {
	const existing = registry.get(storageKey);
	if (existing) return existing;

	const store = () =>
		typeof sessionStorage === "undefined" ? null : sessionStorage;

	const active = ref(store()?.getItem(`${storageKey}.active`) === "1");
	const index = ref(Number(store()?.getItem(`${storageKey}.index`)) || 0);
	const isReplay = ref(store()?.getItem(`${storageKey}.isReplay`) === "1");
	const runId = ref(
		store()?.getItem(`${storageKey}.runId`) || (active.value ? newRunId() : ""),
	);

	watch([active, index, isReplay, runId], () => {
		const target = store();
		if (!target) return;
		try {
			target.setItem(`${storageKey}.active`, active.value ? "1" : "0");
			target.setItem(`${storageKey}.index`, String(index.value));
			target.setItem(`${storageKey}.isReplay`, isReplay.value ? "1" : "0");
			if (runId.value) target.setItem(`${storageKey}.runId`, runId.value);
			else target.removeItem(`${storageKey}.runId`);
		} catch (err) {
			console.warn("[tour] persist failed", err);
		}
	});

	const controller: TourController = {
		active,
		index,
		isReplay,
		runId,
		start: (replay = false) => {
			isReplay.value = replay;
			index.value = 0;
			runId.value = newRunId();
			active.value = true;
		},
		stop: () => {
			active.value = false;
			index.value = 0;
		},
	};
	registry.set(storageKey, controller);

	return controller;
};
