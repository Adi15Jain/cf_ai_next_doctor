import type { Finding } from "./finding";
import type { RepoSnapshot } from "./repo-snapshot";

type Version = readonly [major: number, minor: number, patch: number];

const NATIVE_ADDON_PACKAGES = new Set([
  "sharp",
  "bcrypt",
  "better-sqlite3",
  "sqlite3",
  "argon2",
  "canvas",
  "@napi-rs/canvas"
]);
const PROXY_ENTRY_PATHS = new Set([
  "proxy.ts",
  "proxy.js",
  "src/proxy.ts",
  "src/proxy.js"
]);
// PR #1309, released in @opennextjs/cloudflare 1.20.3 on 2026-08-26.
const PROXY_SUPPORTED_SINCE: Version = [1, 20, 3];
const FIRST_VERSION = /(\d+)\.(\d+)\.(\d+)/;

/** Native (.node) addons cannot load on Workers; only runtime dependencies are bundled. */
export function checkNativeAddons(snapshot: RepoSnapshot): Finding[] {
  return snapshot.runtimeDependencies
    .filter((dependency) => NATIVE_ADDON_PACKAGES.has(dependency))
    .map(
      (dependency): Finding => ({
        failureId: "native-addon-dependency",
        severity: "warning",
        file: "package.json",
        line: null,
        evidence: `${dependency} is in dependencies`
      })
    );
}

/** proxy.ts on OpenNext needs adapter 1.20.3+; warns when package.json allows older. */
export function checkProxyAdapterVersion(snapshot: RepoSnapshot): Finding[] {
  const range = snapshot.openNextVersionRange;
  const proxyFile = snapshot.serverFiles.find((file) =>
    PROXY_ENTRY_PATHS.has(file.path)
  );
  const floor = range === null ? null : lowestVersionIn(range);
  if (snapshot.adapter !== "opennext" || !proxyFile || !floor) return [];
  if (!isOlderThan(floor, PROXY_SUPPORTED_SINCE)) return [];
  return [
    {
      failureId: "proxy-needs-newer-adapter",
      severity: "warning",
      file: proxyFile.path,
      line: null,
      evidence: `${proxyFile.path} exists and package.json allows @opennextjs/cloudflare ${range}`
    }
  ];
}

// For "^1.19.0", "~1.19.0", ">=1.19.0" and "1.19.0" the first version is the lower bound.
// Ranges without one ("latest", "workspace:*") return null and are skipped.
function lowestVersionIn(range: string): Version | null {
  const match = FIRST_VERSION.exec(range);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function isOlderThan(version: Version, target: Version): boolean {
  for (let part = 0; part < version.length; part += 1) {
    if (version[part] !== target[part]) return version[part] < target[part];
  }
  return false;
}
