import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { TourMedia, TourPlacement } from "./types";

// Always-on hotspots: pulsing beacons that live permanently on tricky UI
// (independent of any linear tour) and open an explainer card on click.
// Same machinery as the tour's beacon + card, but persistent and
// per-element. The host renders the beacons/card from the computed styles;
// this composable owns discovery, measurement, and dismissal persistence.

export type TourHotspot = {
	id: string;
	/** CSS selector for the element the beacon rides. */
	target: string;
	title: string;
	body: string;
	placement?: TourPlacement;
	media?: TourMedia;
	/** Hide the beacon permanently once the viewer has opened it. */
	once?: boolean;
};

export type TourHotspotsOptions = {
	/** The hotspots for the current page — a getter so it can be reactive. */
	hotspots: () => TourHotspot[];
	/** Namespace for dismissal persistence. Default "absolute.tour". */
	storageKey?: string;
	/** Master switch (e.g. off while a tour is playing). Default on. */
	enabled?: () => boolean;
};

type HotspotRect = {
	bottom: number;
	height: number;
	left: number;
	right: number;
	top: number;
	width: number;
};

const MEASURE_INTERVAL_MS = 250;
const CARD_WIDTH = 320;
const CARD_GAP = 12;
const VIEW_MARGIN = 12;
const BEACON_OFFSET = 6;
const FLIP_RESERVE = 200;

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

export const useTourHotspots = (options: TourHotspotsOptions) => {
	const storageKey = options.storageKey ?? "absolute.tour";
	const bucket = `${storageKey}.hotspots.dismissed`;
	const store = () =>
		typeof localStorage === "undefined" ? null : localStorage;

	const loadDismissed = (): string[] => {
		const raw = store()?.getItem(bucket);
		if (!raw) return [];
		try {
			const parsed: unknown = JSON.parse(raw);

			return Array.isArray(parsed)
				? parsed.filter((id): id is string => typeof id === "string")
				: [];
		} catch {
			return [];
		}
	};

	const dismissedIds = ref<string[]>(loadDismissed());
	const rects = ref<Record<string, HotspotRect>>({});
	const openId = ref<string | null>(null);

	const persistDismissed = () => {
		try {
			store()?.setItem(bucket, JSON.stringify(dismissedIds.value));
		} catch (err) {
			console.warn("[tour] hotspot persist failed", err);
		}
	};

	const eligible = () =>
		(options.enabled?.() ?? true)
			? options
					.hotspots()
					.filter(
						(hotspot) => !dismissedIds.value.includes(hotspot.id),
					)
			: [];

	// Track every eligible hotspot's element. Missing elements simply drop
	// out of `rects` (page changed, panel closed) — beacons follow the DOM.
	const measure = () => {
		const next: Record<string, HotspotRect> = {};
		eligible().forEach((hotspot) => {
			const el = document.querySelector(hotspot.target);
			if (!el) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) return;
			next[hotspot.id] = {
				bottom: rect.bottom,
				height: rect.height,
				left: rect.left,
				right: rect.right,
				top: rect.top,
				width: rect.width,
			};
		});
		rects.value = next;
		if (openId.value && !next[openId.value]) openId.value = null;
	};

	/** Beacons to render: each visible hotspot with its position style. */
	const beacons = computed(() =>
		eligible().flatMap((hotspot) => {
			const rect = rects.value[hotspot.id];
			if (!rect) return [];

			return [
				{
					hotspot,
					style: {
						left: `${rect.right - BEACON_OFFSET}px`,
						top: `${rect.top - BEACON_OFFSET}px`,
					},
				},
			];
		}),
	);

	/** The open card (if any) with its clamped position style. */
	const card = computed(() => {
		const id = openId.value;
		if (!id) return null;
		const hotspot = options
			.hotspots()
			.find((candidate) => candidate.id === id);
		const rect = rects.value[id];
		if (!hotspot || !rect) return null;

		const viewW = window.innerWidth;
		const viewH = window.innerHeight;
		let placement = hotspot.placement ?? "bottom";
		if (placement === "bottom" && rect.bottom + FLIP_RESERVE > viewH) {
			placement = "top";
		}

		if (placement === "right") {
			return {
				hotspot,
				style: {
					left: `${rect.right + CARD_GAP}px`,
					top: `${clamp(rect.top, VIEW_MARGIN, viewH - FLIP_RESERVE)}px`,
				},
			};
		}
		if (placement === "left") {
			return {
				hotspot,
				style: {
					left: `${rect.left - CARD_GAP}px`,
					top: `${clamp(rect.top, VIEW_MARGIN, viewH - FLIP_RESERVE)}px`,
					transform: "translateX(-100%)",
				},
			};
		}
		const left = clamp(
			rect.left + rect.width / 2 - CARD_WIDTH / 2,
			VIEW_MARGIN,
			viewW - CARD_WIDTH - VIEW_MARGIN,
		);
		if (placement === "top") {
			return {
				hotspot,
				style: {
					left: `${left}px`,
					top: `${rect.top - CARD_GAP}px`,
					transform: "translateY(-100%)",
				},
			};
		}

		return {
			hotspot,
			style: { left: `${left}px`, top: `${rect.bottom + CARD_GAP}px` },
		};
	});

	const dismiss = (id: string) => {
		if (!dismissedIds.value.includes(id)) {
			dismissedIds.value = [...dismissedIds.value, id];
			persistDismissed();
		}
		if (openId.value === id) openId.value = null;
	};

	const open = (id: string) => {
		openId.value = id;
	};

	const close = () => {
		const id = openId.value;
		openId.value = null;
		if (!id) return;
		const hotspot = options
			.hotspots()
			.find((candidate) => candidate.id === id);
		if (hotspot?.once) dismiss(id);
	};

	const restoreAll = () => {
		dismissedIds.value = [];
		persistDismissed();
	};

	let timer = 0;
	onMounted(() => {
		measure();
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		timer = window.setInterval(measure, MEASURE_INTERVAL_MS);
	});
	onBeforeUnmount(() => {
		window.removeEventListener("resize", measure);
		window.removeEventListener("scroll", measure, true);
		clearInterval(timer);
	});

	return { beacons, card, close, dismiss, open, openId, restoreAll };
};

export type TourHotspots = ReturnType<typeof useTourHotspots>;
