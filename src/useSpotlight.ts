import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import type { TourStep } from "./types";
import type { TourController } from "./controller";

const TOOLTIP_WIDTH = 340;
const GAP = 14;
const PAD = 6;
const VIEWPORT_MARGIN = 12;
const TARGET_WAIT_MS = 3500;
// Re-measure at these delays (ms) after a step so the spotlight settles exactly
// once scroll + late layout finish.
const SETTLE_DELAYS_MS = [120, 300, 600];
// And on this light interval while active, to follow LATE reflows (a page
// loading its data and resizing its header after we measured) — those emit no
// scroll/resize event.
const TRACK_INTERVAL_MS = 150;
const FLIP_RESERVE = 220;
const MAX_TOOLTIP_TOP = 160;

export type SpotlightOptions = {
	/** The ordered steps to walk. A getter so it can be reactive/swappable. */
	steps: () => TourStep[];
	/** Shared active/index state (see useTourController). */
	controller: TourController;
	/** Called when the user finishes the last step or skips. */
	onClose: () => void;
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

// Poll for the target — after a route change the page may still be rendering,
// so retry up to `timeout` ms before giving up (→ centered card).
const waitForEl = (selector: string, timeout: number) =>
	new Promise<Element | null>((resolve) => {
		const deadline = Date.now() + timeout;
		const tick = () => {
			const found = document.querySelector(selector);
			if (found) {
				resolve(found);

				return;
			}
			if (Date.now() > deadline) {
				resolve(null);

				return;
			}
			requestAnimationFrame(tick);
		};
		tick();
	});

export const useSpotlight = (options: SpotlightOptions) => {
	const { controller, onClose } = options;
	const { active, index } = controller;
	const router = useRouter();
	const route = useRoute();

	const targetRect = ref<DOMRect | null>(null);
	let currentEl: Element | null = null;
	let locateToken = 0;

	const steps = computed(() => options.steps());
	const step = computed(() => steps.value[index.value] ?? null);
	const stepCount = computed(() => steps.value.length);
	const isLast = computed(() => index.value === steps.value.length - 1);
	const isFirst = computed(() => index.value === 0);
	const isCentered = computed(() => !targetRect.value);

	const measure = () => {
		if (currentEl) targetRect.value = currentEl.getBoundingClientRect();
	};

	const locate = async () => {
		locateToken += 1;
		const token = locateToken;
		currentEl = null;
		targetRect.value = null;
		const current = step.value;
		if (!current) return;

		if (current.route && route.path !== current.route) {
			await router.push(current.route);
		}
		if (token !== locateToken) return;
		if (!current.target) return; // centered card

		const node = await waitForEl(current.target, TARGET_WAIT_MS);
		if (token !== locateToken || !node) return;

		currentEl = node;
		node.scrollIntoView({ block: "center", inline: "nearest" });
		await nextTick();
		const remeasure = () => {
			if (token === locateToken) measure();
		};
		requestAnimationFrame(remeasure);
		SETTLE_DELAYS_MS.forEach((delay) => setTimeout(remeasure, delay));
	};

	const next = () => {
		if (isLast.value) {
			onClose();

			return;
		}
		index.value += 1;
	};

	const back = () => {
		if (index.value > 0) index.value -= 1;
	};

	const skip = () => onClose();

	const onKey = (event: KeyboardEvent) => {
		if (!active.value) return;
		if (event.key === "Escape") skip();
		else if (event.key === "ArrowRight" || event.key === "Enter") next();
		else if (event.key === "ArrowLeft") back();
	};

	const spotlightStyle = computed(() => {
		const rect = targetRect.value;
		if (!rect) return { display: "none" };

		return {
			height: `${rect.height + PAD * 2}px`,
			left: `${rect.left - PAD}px`,
			top: `${rect.top - PAD}px`,
			width: `${rect.width + PAD * 2}px`,
		};
	});

	// Position the tooltip relative to the target, honoring placement but
	// flipping/clamping so it always stays on-screen.
	const tooltipStyle = computed(() => {
		const rect = targetRect.value;
		if (!rect) return {};

		const viewW = window.innerWidth;
		const viewH = window.innerHeight;
		let placement = step.value?.placement ?? "bottom";
		if (placement === "bottom" && rect.bottom + FLIP_RESERVE > viewH) {
			placement = "top";
		}

		if (placement === "right") {
			return {
				left: `${rect.right + GAP}px`,
				top: `${clamp(rect.top, VIEWPORT_MARGIN, viewH - MAX_TOOLTIP_TOP)}px`,
			};
		}
		if (placement === "left") {
			return {
				left: `${rect.left - GAP}px`,
				top: `${clamp(rect.top, VIEWPORT_MARGIN, viewH - MAX_TOOLTIP_TOP)}px`,
				transform: "translateX(-100%)",
			};
		}
		const left = clamp(
			rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
			VIEWPORT_MARGIN,
			viewW - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
		);
		if (placement === "top") {
			return {
				left: `${left}px`,
				top: `${rect.top - GAP}px`,
				transform: "translateY(-100%)",
			};
		}

		return { left: `${left}px`, top: `${rect.bottom + GAP}px` };
	});

	watch(active, (isActive) => {
		if (isActive) void locate();
	});
	watch(index, () => void locate());

	let trackTimer = 0;
	onMounted(() => {
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		window.addEventListener("keydown", onKey);
		trackTimer = window.setInterval(() => {
			if (active.value && currentEl) measure();
		}, TRACK_INTERVAL_MS);
		// Resume after a cross-page reload — index/active are restored from storage.
		if (active.value) void locate();
	});
	onBeforeUnmount(() => {
		window.removeEventListener("resize", measure);
		window.removeEventListener("scroll", measure, true);
		window.removeEventListener("keydown", onKey);
		clearInterval(trackTimer);
	});

	return {
		active,
		back,
		index,
		isCentered,
		isFirst,
		isLast,
		next,
		skip,
		spotlightStyle,
		step,
		stepCount,
		tooltipStyle,
		// The tuned constants, exposed so the host's view can match its padding/
		// ring to the engine's measurements.
		PAD,
		TOOLTIP_WIDTH,
	};
};
