import { describe, expect, it } from "vitest";
import {
  fetchOpenNextReleases,
  RegistryUnavailableError
} from "../src/npm/opennext-release";

/** A fake npm registry serving abbreviated metadata; counts how often it was called. */
function fakeRegistry(nextPeerByVersion: Record<string, string>) {
  const versions = Object.fromEntries(
    Object.entries(nextPeerByVersion).map(([version, next]) => [
      version,
      { peerDependencies: { next } }
    ])
  );
  const calls: string[] = [];
  const fetchFunction: typeof fetch = async (input) => {
    calls.push(String(input));
    return Response.json({ name: "@opennextjs/cloudflare", versions });
  };
  return { fetchFunction, calls };
}

describe("fetchOpenNextReleases", () => {
  const registry = fakeRegistry({
    "1.19.0": ">=15.0.0",
    "1.20.11": ">=15.5.27 <16 || >=16.3.8",
    "1.21.0-beta.1": ">=16.4.0",
    "2.0.0": ">=17"
  });

  it("returns the releases the declared range allows, newest first, without prereleases", async () => {
    expect(
      await fetchOpenNextReleases("^1.19.0", registry.fetchFunction)
    ).toEqual([
      { version: "1.20.11", supportedNextRange: ">=15.5.27 <16 || >=16.3.8" },
      { version: "1.19.0", supportedNextRange: ">=15.0.0" }
    ]);
  });

  it("keeps releases that declare no next peer, with a null range", async () => {
    const versions = {
      "1.6.5": {},
      "1.20.11": { peerDependencies: { next: ">=16.3.8" } }
    };
    const registry: typeof fetch = async () => Response.json({ versions });
    expect(await fetchOpenNextReleases("^1.6.0", registry)).toEqual([
      { version: "1.20.11", supportedNextRange: ">=16.3.8" },
      { version: "1.6.5", supportedNextRange: null }
    ]);
  });

  it("returns nothing when no release matches the declared range", async () => {
    expect(
      await fetchOpenNextReleases("^3.0.0", registry.fetchFunction)
    ).toEqual([]);
  });

  it("does not call the registry for a non-semver range", async () => {
    const quiet = fakeRegistry({});
    expect(
      await fetchOpenNextReleases("workspace:*", quiet.fetchFunction)
    ).toEqual([]);
    expect(quiet.calls).toEqual([]);
  });

  it("reports an unavailable registry with a specific error", async () => {
    const failing: typeof fetch = async () =>
      new Response("busy", { status: 503 });
    await expect(fetchOpenNextReleases("^1.19.0", failing)).rejects.toThrow(
      RegistryUnavailableError
    );
  });

  it("reports a network failure with the same error", async () => {
    const offline: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(fetchOpenNextReleases("^1.19.0", offline)).rejects.toThrow(
      RegistryUnavailableError
    );
  });
});
