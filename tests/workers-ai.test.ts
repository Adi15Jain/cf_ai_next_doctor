import { describe, expect, it } from "vitest";
import { withoutStreaming } from "../src/workers-ai";

/** A stand-in for the AI binding that records what `run` receives. */
class RecordingBinding {
  readonly calls: unknown[][] = [];
  readonly label = "binding";
  async run(...args: unknown[]): Promise<unknown> {
    this.calls.push(args);
    return { response: "ok" };
  }
  describe(): string {
    return this.label;
  }
}

function wrap(binding: RecordingBinding): Ai {
  // The test double implements only what the wrapper touches.
  return withoutStreaming(binding as unknown as Ai);
}

describe("withoutStreaming", () => {
  it("asks for a whole response even when the caller asks for a stream", async () => {
    const binding = new RecordingBinding();
    const inputs = { messages: [], stream: true, max_tokens: 100 };
    await wrap(binding).run("@cf/meta/llama", inputs, { gateway: undefined });
    expect(binding.calls).toEqual([
      [
        "@cf/meta/llama",
        { messages: [], stream: false, max_tokens: 100 },
        { gateway: undefined }
      ]
    ]);
    expect(inputs.stream).toBe(true);
  });

  it("passes other methods through with the binding as `this`", () => {
    const binding = new RecordingBinding();
    const wrapped = wrap(binding) as unknown as RecordingBinding;
    expect(wrapped.describe()).toBe("binding");
  });
});
