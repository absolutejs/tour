import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import type { TourStep, TourTheme } from "./types";
import type { TourController } from "./controller";
import {
	runTourActions,
	useTourActions,
	type TourActionRegistry,
} from "./actions";

const TOOLTIP_WIDTH = 340;
const GAP = 14;
const DEFAULT_PAD = 6;
const DEFAULT_RADIUS = 12;
const VIEWPORT_MARGIN = 12;
const TARGET_WAIT_MS = 3500;
// Re-measure at these delays (ms) after a step so the spotlight settles exactly
// once scroll + late layout finish.
const SETTLE_DELAYS_MS = [120, 300, 600];
// And on this light interval while active, to follow LATE reflows (a page
// loading its data and resizing its header after we measured).
const TRACK_INTERVAL_MS = 150;
const FLIP_RESERVE = 220;
const MAX_TOOLTIP_TOP = 160;
const DEFAULT_DIM = 0.62;
const DEFAULT_TIMER_MS = 6000;
const DEFAULT_TRANSITION_MS = 260;

export type SpotlightOptions = {
	/** The ordered steps to walk. A getter so it can be reactive/swappable. */
	steps: () => TourStep[];
	/** Shared active/index state (see useTourController). */
	controller: TourController;
	/** Called when the user finishes the last step or skips. */
	onClose: () => void;
	/** Optional per-tutorial theme → exposed as CSS custom properties. */
	theme?: () => TourTheme | undefined;
	/** Registry that resolves the steps' onEnter/onExit action names. Defaults
	 *  to the shared useTourActions() registry. */
	actions?: TourActionRegistry;
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

	const actions = options.actions ?? useTourActions();

	const targetRect = ref<DOMRect | null>(null);
	let currentEl: Element | null = null;
	let locateToken = 0;
	let advanceTimer = 0;
	let clickAdvanceEl: Element | null = null;
	// The step whose onEnter actions ran (and its element), so its onExit can
	// run before the next step takes over — and the AbortController that cancels
	// an in-flight action sequence when the step changes under it.
	let actionAbort: AbortController | null = null;
	let actionStep: TourStep | null = null;
	let actionEl: Element | null = null;

	const steps = computed(() => options.steps());
	const step = computed(() => steps.value[index.value] ?? null);
	const stepCount = computed(() => steps.value.length);
	const isLast = computed(() => index.value === steps.value.length - 1);
	const isFirst = computed(() => index.value === 0);
	const isCentered = computed(() => !targetRect.value);

	const pad = computed(() => step.value?.spotlight?.padding ?? DEFAULT_PAD);

	const measure = () => {
		if (currentEl) targetRect.value = currentEl.getBoundingClientRect();
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

	// Tear down any per-step advance hooks (timer / click-to-advance).
	const clearAdvance = () => {
		if (advanceTimer) {
			clearTimeout(advanceTimer);
			advanceTimer = 0;
		}
		if (clickAdvanceEl) {
			clickAdvanceEl.removeEventListener("click", onTargetClick);
			clickAdvanceEl = null;
		}
	};
	function onTargetClick() {
		next();
	}

	const actionContextFor = (
		current: TourStep,
		target: Element | null,
		signal: AbortSignal,
	) => ({
		back,
		index: index.value,
		next,
		signal,
		step: current,
		stop: skip,
		target,
	});

	// Cancel any in-flight action run, then fire the finished step's onExit
	// (cleanup) actions. Returns the fresh AbortController for the next run.
	const rotateActions = () => {
		actionAbort?.abort();
		const abort = new AbortController();
		actionAbort = abort;
		const exitStep = actionStep;
		const exitEl = actionEl;
		actionStep = null;
		actionEl = null;
		const exited = exitStep?.onExit
			? runTourActions(
					exitStep.onExit,
					actions,
					actionContextFor(exitStep, exitEl, abort.signal),
				)
			: Promise.resolve();

		return { abort, exited };
	};

	const enterActions = (
		current: TourStep,
		node: Element | null,
		abort: AbortController,
	) => {
		actionStep = current;
		actionEl = node;
		if (!current.onEnter) return;
		// Fire-and-forget so the card shows while the demo plays.
		void runTourActions(
			current.onEnter,
			actions,
			actionContextFor(current, node, abort.signal),
		);
	};

	const armAdvance = (node: Element | null) => {
		const advance = step.value?.advance;
		if (!advance || !advance.on || advance.on === "button") return;
		if (advance.on === "timer") {
			advanceTimer = window.setTimeout(
				() => next(),
				advance.delayMs ?? DEFAULT_TIMER_MS,
			);
		} else if (advance.on === "target-click" && node) {
			clickAdvanceEl = node;
			node.addEventListener("click", onTargetClick);
		}
	};

	const locate = async () => {
		locateToken += 1;
		const token = locateToken;
		clearAdvance();
		const { abort, exited } = rotateActions();
		currentEl = null;
		targetRect.value = null;
		// Let the previous step's cleanup finish before moving (it may restore
		// UI the next step depends on) — unless a newer locate superseded us.
		await exited;
		if (token !== locateToken) return;
		const current = step.value;
		if (!current) return;

		if (current.route && route.path !== current.route) {
			await router.push(current.route);
		}
		if (token !== locateToken) return;
		if (!current.target) {
			armAdvance(null); // timer can still drive a centered step
			enterActions(current, null, abort);

			return;
		}

		const node = await waitForEl(current.target, TARGET_WAIT_MS);
		if (token !== locateToken) return;
		if (!node) {
			// Missing target degrades to a centered card — its actions still run.
			enterActions(current, null, abort);

			return;
		}

		currentEl = node;
		node.scrollIntoView({ block: "center", inline: "nearest" });
		await nextTick();
		const remeasure = () => {
			if (token === locateToken) measure();
		};
		requestAnimationFrame(remeasure);
		SETTLE_DELAYS_MS.forEach((delay) => setTimeout(remeasure, delay));
		armAdvance(node);
		enterActions(current, node, abort);
	};

	const onKey = (event: KeyboardEvent) => {
		if (!active.value) return;
		if (event.key === "Escape") skip();
		else if (event.key === "ArrowRight" || event.key === "Enter") next();
		else if (event.key === "ArrowLeft") back();
	};

	const spotlightStyle = computed(() => {
		const rect = targetRect.value;
		if (!rect) return { display: "none" };
		const space = pad.value;
		const circle = step.value?.spotlight?.shape === "circle";
		const radius = circle
			? "50%"
			: `${step.value?.spotlight?.radius ?? DEFAULT_RADIUS}px`;

		return {
			borderRadius: radius,
			height: `${rect.height + space * 2}px`,
			left: `${rect.left - space}px`,
			top: `${rect.top - space}px`,
			width: `${rect.width + space * 2}px`,
		};
	});

	// The click-blocking layer(s). Normally one full-screen blocker; when the
	// step allows interaction, four rects AROUND the target so the highlighted
	// element stays clickable (the visual dim still comes from the spotlight's
	// box-shadow).
	const blockers = computed(() => {
		const rect = targetRect.value;
		const full: Record<string, string> = {
			bottom: "0",
			left: "0",
			right: "0",
			top: "0",
		};
		if (!rect || !step.value?.spotlight?.allowInteraction) return [full];

		const space = pad.value;
		const bandTop: Record<string, string> = {
			bottom: "auto",
			height: `${Math.max(0, rect.top - space)}px`,
			left: "0",
			right: "0",
			top: "0",
		};
		const bandBottom: Record<string, string> = {
			bottom: "0",
			left: "0",
			right: "0",
			top: `${rect.bottom + space}px`,
		};
		const bandLeft: Record<string, string> = {
			height: `${rect.height + space * 2}px`,
			left: "0",
			top: `${rect.top - space}px`,
			width: `${Math.max(0, rect.left - space)}px`,
		};
		const bandRight: Record<string, string> = {
			height: `${rect.height + space * 2}px`,
			left: `${rect.right + space}px`,
			right: "0",
			top: `${rect.top - space}px`,
		};

		return [bandTop, bandBottom, bandLeft, bandRight];
	});

	const showBeacon = computed(() => Boolean(step.value?.beacon && targetRect.value));
	const beaconStyle = computed(() => {
		const rect = targetRect.value;
		if (!rect) return { display: "none" };

		return { left: `${rect.right - 6}px`, top: `${rect.top - 6}px` };
	});

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

	// Entrance animation for the card — re-keyed per step so it replays.
	const cardAnimationStyle = computed(() => {
		const transition = step.value?.transition;
		const kind = transition?.kind ?? "fade";
		if (kind === "none") return {};
		const ms = transition?.durationMs ?? DEFAULT_TRANSITION_MS;

		return { animation: `tour-${kind} ${ms}ms cubic-bezier(0.16,1,0.3,1)` };
	});

	// Per-tutorial theme → CSS custom properties (only the ones provided).
	const themeVars = computed(() => {
		const theme = options.theme?.();
		const vars: Record<string, string> = {
			"--tour-dim": String(theme?.dimOpacity ?? DEFAULT_DIM),
		};
		if (theme?.accent) vars["--tour-accent"] = theme.accent;
		if (theme?.accentText) vars["--tour-accent-text"] = theme.accentText;
		if (theme?.surface) vars["--tour-surface"] = theme.surface;
		if (theme?.textColor) vars["--tour-text"] = theme.textColor;
		if (theme?.radius) vars["--tour-radius"] = theme.radius;

		return vars;
	});

	watch(active, (isActive) => {
		if (isActive) {
			void locate();
		} else {
			clearAdvance();
			// Closing the tour still runs the last step's cleanup actions.
			const { exited } = rotateActions();
			void exited;
		}
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
		// Resume after a cross-page reload — index/active restored from storage.
		if (active.value) void locate();
	});
	onBeforeUnmount(() => {
		window.removeEventListener("resize", measure);
		window.removeEventListener("scroll", measure, true);
		window.removeEventListener("keydown", onKey);
		clearInterval(trackTimer);
		clearAdvance();
		actionAbort?.abort();
	});

	return {
		active,
		back,
		beaconStyle,
		blockers,
		cardAnimationStyle,
		index,
		isCentered,
		isFirst,
		isLast,
		next,
		showBeacon,
		skip,
		spotlightStyle,
		step,
		stepCount,
		themeVars,
		tooltipStyle,
	};
};
