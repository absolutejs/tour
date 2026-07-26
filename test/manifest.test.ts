import { describe, expect, test } from "bun:test";
import { manifest } from "../src/manifest";

describe("Tour manifest", () => {
  test("is a contract-v2 package with a Vue client recipe", () => {
    expect(manifest.contract).toBe(2);
    expect(manifest.wiring?.[0]?.id).toBe("default");
    expect(manifest.wiring?.[0]?.client?.vue).toBeDefined();
  });

  test("keeps workspace inspection admin-only and read-only", () => {
    const authorization = manifest.tools?.list_tour_anchors?.authorization;

    expect(authorization?.audience).toBe("admin");
    expect(authorization?.approval).toBe("never");
    expect(authorization?.effects).toEqual(["read"]);
    expect(authorization?.requiredScopes).toEqual(["workspace:tour:read"]);
  });

  test("keeps serializable settings separate from host behavior", () => {
    expect(Object.keys(manifest.settings.properties)).toEqual([
      "name",
      "steps",
      "theme",
      "trigger",
    ]);
  });
});
