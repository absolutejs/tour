import { getCurrentInstance, onMounted, ref, watch, type Ref } from "vue";

// A tour walks ACROSS pages, and in an MPA each page is its own app mount — so
// moving between steps is a full page reload that would otherwise wipe progress.
// The controller persists {active, index, isReplay, runId} in sessionStorage
// (one key per field, no JSON) so the tour resumes on the next page at the
// right step without fragmenting one analytics run.
// It's a singleton per storage key in the browser, so the overlay component and
// any "replay" button elsewhere in the app share one switch.
//
// Server rendering shapes two rules:
// - The saved run is restored once a component that asked for the
//   controller has MOUNTED, not while it sets up. The server has no
//   sessionStorage, so it always renders the tour as inactive; restoring
//   during setup made the browser's first render show a running tour where
//   the server's HTML had none, and Vue's hydration replaced the markup.
//   EVERY component that asks registers the restore on its own mount, and
//   the first to mount does it: Vue mounts children before their parents,
//   and a child's own mount logic must already see the saved run (the
//   restore is registered when it asks, before its own `onMounted`).
//   Called outside a component, there is nothing to hydrate and it restores
//   at once.
// - On the server every member's request renders in one process, so the
//   controller is never shared there: each call gets its own.

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

type Registered = { controller: TourController; restore: () => void };

const registry = new Map<string, Registered>();

const newRunId = () => crypto.randomUUID();

const createController = (storageKey: string, storage: Storage | null) => {
  const active = ref(false);
  const index = ref(0);
  const isReplay = ref(false);
  const runId = ref("");
  // Until restored, nothing is written back: the defaults must never
  // overwrite a run saved by the previous page.
  let settled = storage === null;

  const restore = () => {
    if (settled || !storage) return;
    settled = true;
    active.value = storage.getItem(`${storageKey}.active`) === "1";
    index.value = Number(storage.getItem(`${storageKey}.index`)) || 0;
    isReplay.value = storage.getItem(`${storageKey}.isReplay`) === "1";
    runId.value =
      storage.getItem(`${storageKey}.runId`) ||
      (active.value ? newRunId() : "");
  };

  watch([active, index, isReplay, runId], () => {
    if (!settled || !storage) return;
    try {
      storage.setItem(`${storageKey}.active`, active.value ? "1" : "0");
      storage.setItem(`${storageKey}.index`, String(index.value));
      storage.setItem(`${storageKey}.isReplay`, isReplay.value ? "1" : "0");
      if (runId.value) storage.setItem(`${storageKey}.runId`, runId.value);
      else storage.removeItem(`${storageKey}.runId`);
    } catch (err) {
      console.warn("[tour] persist failed", err);
    }
  });

  const controller: TourController = {
    active,
    index,
    isReplay,
    runId,
    // Starting or stopping is a decision about now: it supersedes a saved
    // run that has not been restored yet.
    start: (replay = false) => {
      settled = true;
      isReplay.value = replay;
      index.value = 0;
      runId.value = newRunId();
      active.value = true;
    },
    stop: () => {
      settled = true;
      active.value = false;
      index.value = 0;
    },
  };

  return { controller, restore };
};

const browserStorage = () => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    // Storage blocked (privacy settings): the tour still runs, unpersisted.
    return null;
  }
};

export const useTourController = (
  storageKey = "absolute.tour",
): TourController => {
  if (typeof window === "undefined")
    return createController(storageKey, null).controller;
  const registered =
    registry.get(storageKey) ?? createController(storageKey, browserStorage());
  registry.set(storageKey, registered);
  // Idempotent: the first mount (or call outside a component) restores.
  if (getCurrentInstance()) onMounted(registered.restore);
  else registered.restore();

  return registered.controller;
};
