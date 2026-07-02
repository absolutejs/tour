# @absolutejs/tour

Element-level, cross-page **product tour** engine for AbsoluteJS apps.

A tour is described by a small, serializable **protocol** (steps with a target
selector, route, placement, and copy) so it can live in code, in a database, or
be authored in an admin UI — and rendered by the same engine. The engine gives
you:

- **Spotlight positioning** — dims the page, highlights one real element, and
  stays pixel-accurate. It re-measures on a light interval so the highlight
  follows late layout shifts (a page loading its data and reflowing after the
  first measure), not just scroll/resize.
- **Cross-page resume** — in an MPA each page is its own mount, so moving between
  steps is a full reload. The controller persists progress in `sessionStorage`
  and resumes on the next page at the right step.
- **A shared controller** — start/stop the tour from anywhere (a first-visit
  trigger, a "replay" button), all driving one overlay.

Vue 3 and vue-router are peer dependencies. The engine ships as composables; you
render a tiny overlay component with your own styling (see below).

## Install

```sh
bun add @absolutejs/tour
```

## The protocol

```ts
import type { Tutorial } from "@absolutejs/tour";

const tour: Tutorial = {
	slug: "portal-intro",
	trigger: { firstVisitOnly: true, onRoutePrefix: "/portal" },
	steps: [
		{ title: "Welcome", body: "A quick tour.", placement: "center", route: "/dashboard" },
		{
			title: "Your command center",
			body: "Your single best next step is always one click here.",
			route: "/dashboard",
			target: '[data-tour=\"hero\"]',
			placement: "bottom",
		},
		// …intake, matches, network — each navigates and spotlights a real element
	],
};
```

Add `data-tour="…"` attributes to the elements you want to spotlight. A step
with no `target` (or one that can't be found) renders as a centered card.

## Wiring it up

```ts
// shared controller (singleton per storage key)
import { useTourController } from "@absolutejs/tour";
const tour = useTourController("myapp.tour");

// auto-play once on first visit, then stamp your own "seen" marker
if (!account.tourSeenAt) tour.start();

// replay from anywhere (does not re-stamp — pass replay=true)
tour.start(true);
```

Render an overlay component that consumes `useSpotlight` (style it however you
like — the engine only computes geometry):

```vue
<script setup lang="ts">
import { useSpotlight, useTourController } from "@absolutejs/tour";
import { PORTAL_TOUR_STEPS } from "./steps";

const controller = useTourController("myapp.tour");
const emit = defineEmits<{ close: [] }>();
const t = useSpotlight({
	steps: () => PORTAL_TOUR_STEPS,
	controller,
	onClose: () => emit("close"),
});
</script>

<template>
	<Teleport to="body">
		<div v-if="t.active.value && t.step.value" class="tour-root">
			<div class="tour-blocker" :class="{ dim: t.isCentered.value }"></div>
			<div class="tour-spotlight" :style="t.spotlightStyle.value"></div>
			<div
				class="tour-tooltip"
				:class="{ centered: t.isCentered.value }"
				:style="t.isCentered.value ? {} : t.tooltipStyle.value"
			>
				<p>Step {{ t.index.value + 1 }} of {{ t.stepCount.value }}</p>
				<h3>{{ t.step.value.title }}</h3>
				<p>{{ t.step.value.body }}</p>
				<button @click="t.skip">Skip</button>
				<button v-if="!t.isFirst.value" @click="t.back">Back</button>
				<button @click="t.next">{{ t.isLast.value ? "Done" : "Next" }}</button>
			</div>
		</div>
	</Teleport>
</template>
```

The host app owns: the `data-tour` anchors, the step content, and where the
"seen" marker is stored (so finishing a first-visit run stamps it; a replay
does not).

## Step actions — demo the product, don't just point at it

Steps stay serializable, so a step references actions **by name**; the host
registers the handlers. `onEnter` actions run once the step is positioned
(sequentially, cancelled if the step changes mid-run); `onExit` actions run
when the step is left — cleanup/restore.

```ts
// The page that OWNS the surface registers its demo handler (setup):
import { useTourActions } from "@absolutejs/tour";

const actions = useTourActions();
const unregister = actions.register("matches.demo-swipe", async (ctx) => {
	const direction = ctx.args.direction === "left" ? "left" : "right";
	await swiper.value?.demoSwipe(direction); // ctx.signal aborts long demos
});
onBeforeUnmount(unregister);
```

```ts
// The step invokes it — plain JSON, safe to store in a DB / author in an admin UI:
{
	title: "Swipe or list",
	route: "/portal/matches",
	target: '[data-tour="match-view"]',
	onEnter: [
		{ action: "matches.demo-swipe", args: { direction: "right" } },
		{ action: "wait", args: { ms: 700 } },
		{ action: "matches.demo-swipe", args: { direction: "left" } },
	],
}
```

Built-ins (no host code needed): `click`, `scroll`, `wait` — each takes an
optional `selector` (default: the step's target). Unknown action names warn
and skip so a tutorial authored against an unmounted page degrades instead of
breaking the tour. Handlers receive `{ step, target, args, index, signal,
next, back, stop }` — a handler can drive the tour itself (e.g. auto-advance
when its demo finishes).

## Demo data — tour an empty account for free

A tour must be able to show a data-backed surface (matches, pipeline) to a
viewer who has no data yet — a fresh signup, an unsubscribed user — without
the host paying to source anything. `useTourDemo` swaps in a constant,
**fully-typed** sample dataset while the tour plays and passes the real data
through untouched otherwise:

```ts
import { useTourDemo, useTourController } from "@absolutejs/tour";

const controller = useTourController("myapp.tour");
const { data: matches, isDemo } = useTourDemo({
	controller,
	demo: DEMO_MATCHES, // typed PartnerMatch[] — same shape the surface renders
	live: () => realMatches.value,
	mode: () => tutorial.value?.dataMode, // optional per-tutorial override
});
```

Resolution is per `TourDataMode`: `"auto"` (default) shows the viewer's real
data when they have it — so a member with sourced matches is toured on **their
literal matches** — and the sample when they don't; `"demo"` / `"live"` force
one side (`Tutorial.dataMode` carries the choice in the serialized tutorial).
Badge the surface when `isDemo` is true so sample data is never mistaken for
real.

## License

Business Source License 1.1 — see [LICENSE](./LICENSE). Converts to Apache 2.0
on the Change Date.
