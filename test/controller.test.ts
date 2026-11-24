import { afterEach, describe, expect, test } from "bun:test";
import {
  createRenderer,
  createSSRApp,
  defineComponent,
  h,
  onMounted,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { useTourController, type TourController } from "../src/controller";

/* A renderer with no DOM, so a component can mount (and run onMounted) in
 * a test: every node is a plain object. */
type FakeNode = { children: FakeNode[]; text: string };
const fakeNode = (text = ""): FakeNode => ({ children: [], text });
const { createApp } = createRenderer<FakeNode, FakeNode>({
  createComment: (text) => fakeNode(text),
  createElement: () => fakeNode(),
  createText: (text) => fakeNode(text),
  insert: (child, parent) => {
    parent.children.push(child);
  },
  nextSibling: () => null,
  parentNode: () => null,
  patchProp: () => undefined,
  remove: () => undefined,
  setElementText: (node, text) => {
    node.text = text;
  },
  setText: (node, text) => {
    node.text = text;
  },
});

const savedRun = (key: string) =>
  new Map([
    [`${key}.active`, "1"],
    [`${key}.index`, "2"],
    [`${key}.isReplay`, "0"],
    [`${key}.runId`, "run-from-the-previous-page"],
  ]);

const fakeStorage = (entries: Map<string, string>) => ({
  getItem: (name: string) => entries.get(name) ?? null,
  removeItem: (name: string) => {
    entries.delete(name);
  },
  setItem: (name: string, value: string) => {
    entries.set(name, value);
  },
});

const asBrowser = (entries: Map<string, string>) => {
  Reflect.set(globalThis, "window", globalThis);
  Reflect.set(globalThis, "sessionStorage", fakeStorage(entries));
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "sessionStorage");
});

describe("the tour controller and server rendering", () => {
  test("the server renders a tour as inactive, and never shares a controller between requests", async () => {
    const seen: TourController[] = [];
    const Page = defineComponent({
      setup() {
        const tour = useTourController("ssr.tour");
        seen.push(tour);

        return () => h("p", tour.active.value ? "tour" : "no tour");
      },
    });

    const first = await renderToString(createSSRApp(Page));
    seen[0]?.start();
    const second = await renderToString(createSSRApp(Page));

    expect(first).toBe("<p>no tour</p>");
    // One member's started tour does not reach the next member's page.
    expect(second).toBe("<p>no tour</p>");
    expect(seen[0]).not.toBe(seen[1]);
  });

  test("in the browser the first render matches the server, and the saved run arrives once mounted", () => {
    const entries = savedRun("resume.tour");
    asBrowser(entries);
    const renders: boolean[] = [];
    const Page = defineComponent({
      setup() {
        const tour = useTourController("resume.tour");

        return () => {
          renders.push(tour.active.value);

          return h("p", tour.active.value ? "tour" : "no tour");
        };
      },
    });

    createApp(Page).mount(fakeNode());
    const tour = useTourController("resume.tour");

    // The render hydration compares against the server's HTML: inactive.
    expect(renders[0]).toBe(false);
    // Restored after mount, at the step and run the previous page saved.
    expect(tour.active.value).toBe(true);
    expect(tour.index.value).toBe(2);
    expect(tour.runId.value).toBe("run-from-the-previous-page");
    // The saved run was not overwritten by the defaults before restoring.
    expect(entries.get("resume.tour.index")).toBe("2");
  });

  test("a child's own mount logic already sees the saved run, though the parent asked first", () => {
    asBrowser(savedRun("nested.tour"));
    let seenInChildMount: boolean | undefined;
    const Child = defineComponent({
      setup() {
        const tour = useTourController("nested.tour");
        onMounted(() => {
          // Vue mounts the child before the parent that asked first.
          seenInChildMount = tour.active.value;
        });

        return () => h("p");
      },
    });
    const Parent = defineComponent({
      setup() {
        useTourController("nested.tour");

        return () => h(Child);
      },
    });

    createApp(Parent).mount(fakeNode());

    expect(seenInChildMount).toBe(true);
  });

  test("starting a tour before the saved run is restored wins over the saved run", () => {
    asBrowser(savedRun("decided.tour"));
    let tour: TourController | undefined;
    const Page = defineComponent({
      setup() {
        tour = useTourController("decided.tour");
        tour.stop();

        return () => h("p");
      },
    });

    createApp(Page).mount(fakeNode());

    expect(tour?.active.value).toBe(false);
  });

  test("outside a component there is nothing to hydrate, so it restores at once", () => {
    asBrowser(savedRun("plain.tour"));

    expect(useTourController("plain.tour").active.value).toBe(true);
  });
});
