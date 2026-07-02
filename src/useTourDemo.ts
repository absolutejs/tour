import { computed, type ComputedRef } from "vue";
import type { TourController } from "./controller";
import type { TourDataMode } from "./types";

// A tour has to be able to SHOW a data-backed surface (matches, pipeline,
// metrics) to a viewer who hasn't earned that data yet — a fresh signup, an
// unsubscribed user — without the host paying to source anything. The host
// hands this composable a constant, fully-typed sample dataset plus its real
// (reactive) data source; while the tour plays, the surface renders whichever
// side the mode resolves to, and outside the tour the real data passes
// through untouched. "auto" is the important mode: a member who already has
// real matches is toured on THEIR matches, everyone else sees the sample.

export type TourDemoOptions<DataShape> = {
	/** The tour whose activity gates the swap (see useTourController). */
	controller: TourController;
	/** The constant sample dataset. Its type IS the contract — it must be the
	 *  same shape as the live data, so the surface renders it unchanged. */
	demo: DataShape;
	/** Getter for the real data (reactive; null/undefined while absent). */
	live: () => DataShape | null | undefined;
	/** Does this live value count as "has data"? Default: non-nullish, and
	 *  non-empty when it's an array. */
	hasLive?: (value: DataShape) => boolean;
	/** Resolution override, e.g. wired to Tutorial.dataMode. Default "auto". */
	mode?: () => TourDataMode | undefined;
};

export type TourDemoData<DataShape> = {
	/** What the surface should render right now. */
	data: ComputedRef<DataShape | null | undefined>;
	/** True when the sample is showing — hosts should badge the surface
	 *  ("Sample data") so the viewer never mistakes it for their own. */
	isDemo: ComputedRef<boolean>;
};

const defaultHasLive = <DataShape>(value: DataShape) =>
	Array.isArray(value) ? value.length > 0 : true;

export const useTourDemo = <DataShape>(
	options: TourDemoOptions<DataShape>,
): TourDemoData<DataShape> => {
	const isDemo = computed(() => {
		if (!options.controller.active.value) return false;
		const mode = options.mode?.() ?? "auto";
		if (mode === "live") return false;
		if (mode === "demo") return true;
		const liveValue = options.live();
		if (liveValue === null || liveValue === undefined) return true;

		return !(options.hasLive ?? defaultHasLive)(liveValue);
	});

	const data = computed(() =>
		isDemo.value ? options.demo : options.live(),
	);

	return { data, isDemo };
};
