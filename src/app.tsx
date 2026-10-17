import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  Banner,
  Button,
  Empty,
  InputArea,
  PoweredByCloudflare,
  Text
} from "@cloudflare/kumo";
import {
  CircleIcon,
  MoonIcon,
  PaperPlaneRightIcon,
  StethoscopeIcon,
  StopIcon,
  SunIcon,
  TrashIcon
} from "@phosphor-icons/react";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import type { ChatAgent, ChatState } from "./server";
import { MessageView } from "./ui/message-view";
import { ActiveScanList, ScanForm } from "./ui/scan-panel";

const CHAT_ID_STORAGE_KEY = "next-doctor-chat-id";
const THEME_STORAGE_KEY = "theme";
const STREAM_THROTTLE_MS = 100;
// One of the public OpenNext apps the checks were tried on; its scan shows several findings.
const EXAMPLE_REPO_URL = "https://github.com/APIs-guru/APIs-guru.github.io";
const LOG_PROMPT = "Here is the error from my deploy:\n\n";
const HISTORY_PROMPT = "What did my earlier scans find?";

/** The whole app: one chat, with a repository box that starts scans. */
export default function App() {
  // One Durable Object per browser, so visitors never share a chat or a scan history.
  const [chatId] = useState(() => {
    const saved = localStorage.getItem(CHAT_ID_STORAGE_KEY);
    if (saved !== null) return saved;
    const created = crypto.randomUUID();
    localStorage.setItem(CHAT_ID_STORAGE_KEY, created);
    return created;
  });
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useAgent<ChatAgent, ChatState>({
    agent: "ChatAgent",
    name: chatId,
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), [])
  });
  const { messages, sendMessage, clearHistory, stop, status, error } =
    useAgentChat({
      agent,
      experimental_throttle: STREAM_THROTTLE_MS
    });
  const isStreaming = status === "streaming" || status === "submitted";
  const activeScans = agent.state?.activeScans ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeScans.length]);

  const send = (text: string) => {
    if (text.trim() === "" || isStreaming) return;
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    setInput("");
  };
  const startScan = (repoUrl: string) => agent.stub.startScan(repoUrl);

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated">
      <Header connected={connected} onClear={clearHistory} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && activeScans.length === 0 && (
            <Starters
              canSend={connected && !isStreaming}
              onScanExample={() => void startScan(EXAMPLE_REPO_URL)}
              onPasteLog={() => {
                setInput(LOG_PROMPT);
                textareaRef.current?.focus();
              }}
              onShowHistory={() => send(HISTORY_PROMPT)}
            />
          )}
          {messages.map((message, index) => (
            <MessageView
              key={message.id}
              message={message}
              isAnimating={isStreaming && index === messages.length - 1}
            />
          ))}
          {error !== undefined && (
            <Banner
              variant="error"
              title="The reply failed"
              description={error.message}
            />
          )}
          <ActiveScanList scans={activeScans} />
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="border-t border-kumo-line bg-kumo-base">
        <div className="max-w-3xl mx-auto px-5 py-4 space-y-3">
          <ScanForm startScan={startScan} disabled={!connected} />
          <ChatInput
            ref={textareaRef}
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            onStop={stop}
            connected={connected}
            isStreaming={isStreaming}
          />
          <div className="flex justify-center">
            <PoweredByCloudflare href="https://developers.cloudflare.com/agents/" />
          </div>
        </div>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );
  const toggle = () => {
    const mode = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    setIsDark(!isDark);
  };
  return (
    <Button
      variant="secondary"
      shape="square"
      icon={isDark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle dark mode"
    />
  );
}

function Header({
  connected,
  onClear
}: {
  readonly connected: boolean;
  readonly onClear: () => void;
}) {
  return (
    <header className="px-5 py-3 bg-kumo-base border-b border-kumo-line">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-kumo-default">
            Next Doctor
          </h1>
          <Text size="xs" variant="secondary">
            Finds what will break when a Next.js app runs on Cloudflare Workers
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <CircleIcon
            size={8}
            weight="fill"
            aria-label={connected ? "Connected" : "Disconnected"}
            className={connected ? "text-kumo-success" : "text-kumo-danger"}
          />
          <ThemeToggle />
          <Button
            variant="secondary"
            icon={<TrashIcon size={16} />}
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
      </div>
    </header>
  );
}

// The empty state offers the three things the app does.
function Starters({
  canSend,
  onScanExample,
  onPasteLog,
  onShowHistory
}: {
  readonly canSend: boolean;
  readonly onScanExample: () => void;
  readonly onPasteLog: () => void;
  readonly onShowHistory: () => void;
}) {
  return (
    <Empty
      icon={<StethoscopeIcon size={32} />}
      title="Scan a repository or paste an error"
      description="Static checks find known Next.js-on-Workers failures; Llama 3.3 explains them."
      contents={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canSend}
            onClick={onScanExample}
          >
            Scan an example repo
          </Button>
          <Button variant="outline" size="sm" onClick={onPasteLog}>
            Paste an error log
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canSend}
            onClick={onShowHistory}
          >
            Show earlier scans
          </Button>
        </div>
      }
    />
  );
}

function ChatInput({
  ref,
  value,
  onChange,
  onSend,
  onStop,
  connected,
  isStreaming
}: {
  readonly ref: Ref<HTMLTextAreaElement>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly connected: boolean;
  readonly isStreaming: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
      className="flex items-end gap-3 rounded-xl border border-kumo-line p-3 focus-within:ring-2 focus-within:ring-kumo-ring"
    >
      <InputArea
        ref={ref}
        value={value}
        onValueChange={onChange}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder="Ask about a deploy, or paste an error log…"
        disabled={!connected}
        rows={2}
        className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-60"
      />
      {isStreaming ? (
        <Button
          type="button"
          variant="secondary"
          shape="square"
          aria-label="Stop the reply"
          icon={<StopIcon size={18} />}
          onClick={onStop}
        />
      ) : (
        <Button
          type="submit"
          variant="primary"
          shape="square"
          aria-label="Send"
          disabled={!connected || value.trim() === ""}
          icon={<PaperPlaneRightIcon size={18} />}
        />
      )}
    </form>
  );
}
