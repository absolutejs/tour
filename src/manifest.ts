import { defineManifest, toolFactory } from "@absolutejs/manifest";
import { Type } from "@sinclair/typebox";
import type { Tutorial } from "./types";

const tool = toolFactory<never>();

const ANCHOR_PATTERN = /data-tour=["']([^"']+)["']/g;
const MAX_ANCHOR_FILES = 200;

/* The tour protocol is plain JSON by design, so the tutorial itself IS the
 * serializable config: settings are drift-checked against `Tutorial`. The
 * overlay component, action handlers, and the "seen" marker are host code →
 * wiring concerns. This package is client-only (Vue). */
export const manifest = defineManifest<Tutorial>()({
	contract: 1,
	identity: {
		accent: "#a855f7",
		category: "growth",
		description:
			"Element-level, cross-page product tour engine. A tour is a small serializable protocol (steps with a target selector, route, placement, and copy), rendered by a spotlight engine that stays pixel-accurate through late layout shifts and resumes across full-page navigations via sessionStorage. Steps can run named actions to demo the product, not just point at it.",
		docsUrl: "https://github.com/absolutejs/tour",
		name: "@absolutejs/tour",
		tagline: "Guide new visitors through your site step by step.",
	},
	requires: {
		peers: [
			{ name: "vue", range: ">=3.3", reason: "composable host" },
			{ name: "vue-router", range: ">=4", reason: "cross-page navigation" },
		],
	},
	settings: Type.Object({
		name: Type.Optional(
			Type.String({
				description: "A name for this tour, shown in admin surfaces.",
				title: "Tour name",
			}),
		),
		steps: Type.Optional(
			Type.Array(
				Type.Object(
					{
						body: Type.String({
							description: "The step's explanation text.",
							title: "Text",
						}),
						placement: Type.Optional(
							Type.Union(
								[
									Type.Literal("top"),
									Type.Literal("bottom"),
									Type.Literal("left"),
									Type.Literal("right"),
									Type.Literal("center"),
								],
								{
									description:
										"Which side of the highlighted element the card sits on. 'center' shows a centered card with no highlight.",
									title: "Card position",
								},
							),
						),
						route: Type.Optional(
							Type.String({
								description:
									"Navigate to this page before showing the step, for tours that span pages.",
								examples: ["/dashboard"],
								title: "Page",
							}),
						),
						target: Type.Optional(
							Type.String({
								description:
									"CSS selector of the element to highlight. Add data-tour attributes to your elements and target those. Leave empty for a centered card.",
								examples: ['[data-tour="hero"]'],
								title: "Element to highlight",
							}),
						),
						title: Type.String({ title: "Step title" }),
					},
					{ title: "Step" },
				),
				{
					description: "The steps of the tour, in order.",
					title: "Tour steps",
				},
			),
		),
		theme: Type.Optional(
			Type.Object(
				{
					accent: Type.Optional(
						Type.String({ title: "Accent color", examples: ["#6366f1"] }),
					),
					dimOpacity: Type.Optional(
						Type.Number({
							description:
								"How dark the rest of the page gets while a step is highlighted, 0 to 1.",
							maximum: 1,
							minimum: 0,
							title: "Backdrop dim",
						}),
					),
				},
				{ title: "Look" },
			),
		),
		trigger: Type.Optional(
			Type.Object(
				{
					firstVisitOnly: Type.Optional(
						Type.Boolean({
							description: "Play automatically once, on a visitor's first visit.",
							title: "Auto-play on first visit",
						}),
					),
					onRoutePrefix: Type.Optional(
						Type.String({
							description:
								"Only auto-play when the visitor is on a page starting with this path.",
							examples: ["/app"],
							title: "Only on pages under",
						}),
					),
					oncePerSession: Type.Optional(
						Type.Boolean({
							description: "Auto-play at most once per browser session.",
							title: "Once per session",
						}),
					),
				},
				{ title: "When it plays" },
			),
		),
	}),
	tools: {
		list_tour_anchors: tool.workspace({
			annotations: { readOnlyHint: true },
			capabilities: ["read", "glob"],
			description:
				"List the data-tour anchors declared in this project's markup — the elements a tour step can target.",
			handler: async (_input, workspace) => {
				const files =
					(await workspace.glob?.("**/*.{vue,tsx,jsx,html}")) ?? [];
				const anchors = new Map<string, string>();
				for (const file of files.slice(0, MAX_ANCHOR_FILES)) {
					const source = (await workspace.read(file)) ?? "";
					for (const match of source.matchAll(ANCHOR_PATTERN)) {
						const anchor = match[1];
						if (anchor !== undefined && !anchors.has(anchor)) {
							anchors.set(anchor, file);
						}
					}
				}

				return anchors.size === 0
					? "no data-tour anchors found — add data-tour attributes to the elements you want steps to highlight"
					: [...anchors.entries()]
							.map(([anchor, file]) => `${anchor} (${file})`)
							.join("\n");
			},
			input: Type.Object({}),
		}),
	},
	wiring: [
		{
			description:
				"Create the shared controller and the tutorial from settings; render an overlay component with useSpotlight (you own its markup and styling — see the README).",
			id: "default",
			client: {
				vue: {
					code: [
						"// The tour protocol is plain JSON: the steps configured in",
						"// settings and the engine render through an overlay component",
						"// you style yourself (see the README's <template> example).",
						"const tutorial: Tutorial = { steps: [], ...${settings} };",
						"",
						"// Singleton per storage key — the overlay and any replay button",
						"// share one switch, and progress survives full-page navigations.",
						"const tourController = useTourController();",
						"",
						"// Auto-play once on first visit, then stamp your own 'seen'",
						"// marker when it finishes (a replay passes true and must not",
						"// re-stamp):",
						"// TODO: if (!viewer.tourSeenAt) tourController.start();",
					].join("\n"),
					imports: [
						{ from: "@absolutejs/tour", names: ["useTourController"] },
						{ from: "@absolutejs/tour", names: ["Tutorial"], typeOnly: true },
					],
					placement: "client-entry",
				},
			},
			title: "Create the tour",
		},
	],
});
