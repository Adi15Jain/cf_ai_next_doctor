import { Button, Input, Loader, Text } from "@cloudflare/kumo";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { ActiveScan, ScanStage } from "../scan/scan-status";

const STAGE_LABELS: Readonly<Record<ScanStage, string>> = {
  scanning: "downloading and checking",
  explaining: "Llama 3.3 is writing the explanation",
  posting: "posting the report"
};
const GITHUB_PREFIX = "https://github.com/";

/**
 * The repository box. It starts a scan directly through the agent's `startScan`, so scanning
 * never depends on the model picking a tool; a rejected URL shows its reason under the box.
 */
export function ScanForm({
  startScan,
  disabled
}: {
  readonly startScan: (repoUrl: string) => Promise<ActiveScan>;
  readonly disabled: boolean;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [rejection, setRejection] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const submit = async () => {
    setIsStarting(true);
    setRejection(null);
    try {
      await startScan(repoUrl.trim());
      setRepoUrl("");
    } catch (error) {
      setRejection(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-1"
    >
      <div className="flex items-center gap-2">
        <Input
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="https://github.com/owner/repo"
          aria-label="GitHub repository URL"
          className="flex-1 font-mono"
        />
        <Button
          type="submit"
          variant="primary"
          icon={<MagnifyingGlassIcon size={16} />}
          disabled={disabled || isStarting || repoUrl.trim() === ""}
        >
          Scan
        </Button>
      </div>
      {rejection !== null && (
        <Text size="xs" variant="error">
          {rejection}
        </Text>
      )}
    </form>
  );
}

/** One status line per running scan, from the agent state every open tab shares. */
export function ActiveScanList({
  scans
}: {
  readonly scans: readonly ActiveScan[];
}) {
  if (scans.length === 0) return null;
  return (
    <div className="space-y-1">
      {scans.map((scan) => (
        <div key={scan.scanId} className="flex items-center gap-2">
          <Loader size="sm" />
          <Text size="sm" variant="secondary">
            {scan.repoUrl.replace(GITHUB_PREFIX, "")}:{" "}
            {STAGE_LABELS[scan.stage]}…
          </Text>
        </div>
      ))}
    </div>
  );
}
