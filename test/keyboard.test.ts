import { describe, expect, test } from "bun:test";
import { shouldIgnoreTourKey } from "../src/useSpotlight";

const event = (
  key: string,
  target: { closest?: (selector: string) => unknown } | null = null,
  defaultPrevented = false,
) =>
  ({ defaultPrevented, key, target }) as unknown as Parameters<
    typeof shouldIgnoreTourKey
  >[0];

describe("Tour keyboard navigation", () => {
  test("does not duplicate Enter activation from a focused control", () => {
    const button = {
      closest: (selector: string) =>
        selector.includes("button") ? button : null,
    };

    expect(shouldIgnoreTourKey(event("Enter", button))).toBe(true);
  });

  test("keeps Enter navigation for a non-interactive overlay target", () => {
    expect(shouldIgnoreTourKey(event("Enter", { closest: () => null }))).toBe(
      false,
    );
  });

  test("honors host keyboard handlers that already prevented the event", () => {
    expect(shouldIgnoreTourKey(event("ArrowRight", null, true))).toBe(true);
  });
});
