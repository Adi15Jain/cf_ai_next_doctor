import { Badge, Loader, Surface, Text } from "@cloudflare/kumo";
import {
  CheckCircleIcon,
  MagnifyingGlassIcon,
  XCircleIcon
} from "@phosphor-icons/react";
import { code } from "@streamdown/code";
import {
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage
} from "ai";
import { Streamdown } from "streamdown";
import {
  readScanMessageMetadata,
  type ScanMessageMetadata
} from "../scan/scan-status";

const TOOL_LABELS: Readonly<Record<string, string>> = {
  scan_repo: "Started a scan",
  explain_log: "Matched the log against known failures",
  recall_scans: "Read earlier scans"
};
const GITHUB_PREFIX = "https://github.com/";

/** One chat message: a report card for scan results, otherwise text bubbles and tool notes. */
export function MessageView({
  message,
  isAnimating
}: {
  readonly message: UIMessage;
  readonly isAnimating: boolean;
}) {
  const text = message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
  const scan = readScanMessageMetadata(message.metadata);
  if (scan !== null) return <ReportCard scan={scan} markdown={text} />;

  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        const key = `${message.id}-${index}`;
        if (isToolUIPart(part)) return <ToolNote key={key} part={part} />;
        if (part.type !== "text" || part.text === "") return null;
        return message.role === "user" ? (
          <div key={key} className="flex justify-end">
            <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse whitespace-pre-wrap leading-relaxed">
              {part.text}
            </div>
          </div>
        ) : (
          <div key={key} className="max-w-[85%] rounded-2xl bg-kumo-base">
            <Streamdown
              className="sd-theme p-3"
              plugins={{ code }}
              controls={false}
              isAnimating={isAnimating}
            >
              {part.text}
            </Streamdown>
          </div>
        );
      })}
    </div>
  );
}

// Error and warning counts sit in the card header as coloured badges, read from the
// message metadata rather than parsed out of the Markdown.
function ReportCard({
  scan,
  markdown
}: {
  readonly scan: ScanMessageMetadata;
  readonly markdown: string;
}) {
  return (
    <Surface className="rounded-xl ring ring-kumo-line overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-kumo-line">
        <MagnifyingGlassIcon size={16} className="text-kumo-subtle" />
        <Text size="sm" bold>
          {scan.repoUrl.replace(GITHUB_PREFIX, "")}
        </Text>
        {scan.kind === "scan-failed" ? (
          <Badge variant="error">Scan failed</Badge>
        ) : (
          <>
            <Badge variant={scan.errorCount > 0 ? "error" : "success"}>
              {scan.errorCount} error{scan.errorCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant={scan.warningCount > 0 ? "warning" : "success"}>
              {scan.warningCount} warning{scan.warningCount === 1 ? "" : "s"}
            </Badge>
          </>
        )}
      </div>
      <Streamdown className="sd-theme p-4" plugins={{ code }} controls={false}>
        {markdown}
      </Streamdown>
    </Surface>
  );
}

// A one-line note per tool call; the raw input or output stays one click away.
function ToolNote({ part }: { readonly part: ToolUIPart | DynamicToolUIPart }) {
  const name = getToolName(part);
  const label = TOOL_LABELS[name] ?? name;
  const icon =
    part.state === "output-available" ? (
      <CheckCircleIcon size={14} className="text-kumo-success" />
    ) : part.state === "output-error" ? (
      <XCircleIcon size={14} className="text-kumo-danger" />
    ) : (
      <Loader size="sm" />
    );
  const detail =
    part.state === "output-error"
      ? part.errorText
      : JSON.stringify(part.output ?? part.input, null, 2);
  return (
    <details className="text-xs text-kumo-subtle">
      <summary className="flex items-center gap-1.5 cursor-pointer select-none">
        {icon}
        {label}
      </summary>
      <pre className="mt-1 ml-5 font-mono whitespace-pre-wrap overflow-auto max-h-48">
        {detail}
      </pre>
    </details>
  );
}
