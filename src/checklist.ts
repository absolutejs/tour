import { computed, ref } from "vue";

// Onboarding checklist engine — the stickiest pattern in this category: a
// persistent "getting started" panel with N tasks, a progress bar, and each
// task launching a tour or deep link. This is the LOGIC only (typed items,
// completion persistence, progress math, dismissal); the host renders the
// panel and decides what launching a task means.

export type TourChecklistItem = {
	id: string;
	title: string;
	description?: string;
	/** A tutorial this task launches — completing that tutorial (host calls
	 *  completeForTutorial) checks the task off. */
	tutorialSlug?: string;
	/** Or a plain deep link the host navigates to. */
	href?: string;
};

export type TourChecklistOptions = {
	/** Identity of this checklist (its persistence bucket). */
	id: string;
	/** The tasks — a getter so the list can be reactive. */
	items: () => TourChecklistItem[];
	/** Namespace for persistence. Default "absolute.tour". */
	storageKey?: string;
};

type ChecklistState = {
	dismissedAt: string | null;
	done: string[];
};

const isChecklistState = (value: unknown): value is ChecklistState => {
	if (typeof value !== "object" || value === null) return false;

	return "done" in value && Array.isArray(value.done);
};

const PERCENT = 100;

export const useTourChecklist = (options: TourChecklistOptions) => {
	const storageKey = options.storageKey ?? "absolute.tour";
	const bucket = `${storageKey}.checklist.${options.id}`;
	const store = () =>
		typeof localStorage === "undefined" ? null : localStorage;

	const load = (): ChecklistState => {
		const raw = store()?.getItem(bucket);
		if (!raw) return { dismissedAt: null, done: [] };
		try {
			const parsed: unknown = JSON.parse(raw);

			return isChecklistState(parsed)
				? parsed
				: { dismissedAt: null, done: [] };
		} catch {
			return { dismissedAt: null, done: [] };
		}
	};

	const state = ref<ChecklistState>(load());

	const persist = () => {
		try {
			store()?.setItem(bucket, JSON.stringify(state.value));
		} catch (err) {
			console.warn("[tour] checklist persist failed", err);
		}
	};

	const isDone = (itemId: string) => state.value.done.includes(itemId);

	const complete = (itemId: string) => {
		if (isDone(itemId)) return;
		state.value = {
			...state.value,
			done: [...state.value.done, itemId],
		};
		persist();
	};

	const uncomplete = (itemId: string) => {
		state.value = {
			...state.value,
			done: state.value.done.filter((done) => done !== itemId),
		};
		persist();
	};

	/** Check off every task tied to this tutorial — call it when a tutorial
	 *  completes (e.g. from the engine's tour_completed event). */
	const completeForTutorial = (slug: string) => {
		options
			.items()
			.filter((item) => item.tutorialSlug === slug)
			.forEach((item) => complete(item.id));
	};

	const items = computed(() =>
		options.items().map((item) => ({
			...item,
			done: isDone(item.id),
		})),
	);

	const progress = computed(() => {
		const total = options.items().length;
		const done = options
			.items()
			.filter((item) => isDone(item.id)).length;

		return {
			done,
			percent: total === 0 ? 0 : Math.round((done / total) * PERCENT),
			total,
		};
	});

	const dismissed = computed(() => state.value.dismissedAt !== null);

	const dismiss = () => {
		state.value = {
			...state.value,
			dismissedAt: new Date().toISOString(),
		};
		persist();
	};

	const restore = () => {
		state.value = { ...state.value, dismissedAt: null };
		persist();
	};

	const reset = () => {
		state.value = { dismissedAt: null, done: [] };
		persist();
	};

	return {
		complete,
		completeForTutorial,
		dismiss,
		dismissed,
		isDone,
		items,
		progress,
		reset,
		restore,
		uncomplete,
	};
};

export type TourChecklist = ReturnType<typeof useTourChecklist>;
