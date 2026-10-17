/**
 * Llama 3.3 70B on Workers AI, the model the assignment suggests. It supports tool calling
 * and has a 24,000-token context window, which bounds how much repository text a prompt holds.
 */
export const LLAMA_3_3_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * The AI binding, but every `run()` asks for a whole response instead of a stream.
 *
 * Workers AI streams each tool-call fragment twice: in `choices[0].delta.tool_calls` and in a
 * top-level `tool_calls` field. workers-ai-provider 3.3.1 (and 4.0.0) appends both, so the
 * tool arguments arrive doubled, fail to parse, and every tool runs with `{}`. For a whole
 * response the provider reads each call once. The cost: chat replies appear at once.
 */
export function withoutStreaming(binding: Ai): Ai {
  return new Proxy(binding, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property !== "run") return value.bind(target);
      return (model: unknown, inputs: object, options: unknown): unknown =>
        Reflect.apply(value, target, [
          model,
          { ...inputs, stream: false },
          options
        ]);
    }
  });
}
