import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const runEmbeddedPiAgentMock = vi.fn();
const runWithModelFallbackMock = vi.fn();

vi.mock("../../agents/model-fallback.js", () => ({
  runWithModelFallback: (params: {
    provider: string;
    model: string;
    run: (provider: string, model: string) => Promise<unknown>;
  }) => runWithModelFallbackMock(params),
}));

vi.mock("../../agents/pi-embedded.js", () => ({
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: (params: unknown) => runEmbeddedPiAgentMock(params),
}));

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

import { runReplyAgent } from "./agent-runner.js";

function createRun(params: {
  responseUsageFlags?: { tokens?: boolean; cost?: boolean; context?: boolean };
  sessionKey: string;
  config?: OpenClawConfig;
  provider?: string;
}) {
  const typing = createMockTypingController();
  const sessionCtx = {
    Provider: params.provider ?? "whatsapp",
    OriginatingTo: "+15550001111",
    AccountId: "primary",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;

  const sessionEntry: SessionEntry = {
    sessionId: "session",
    updatedAt: Date.now(),
    responseUsageFlags: params.responseUsageFlags,
  };

  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: params.sessionKey,
      messageProvider: "whatsapp",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: params.config ?? {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;

  return runReplyAgent({
    commandBody: "hello",
    followupRun,
    queueKey: "main",
    resolvedQueue,
    shouldSteer: false,
    shouldFollowup: false,
    isActive: false,
    isStreaming: false,
    typing,
    sessionCtx,
    sessionEntry,
    sessionKey: params.sessionKey,
    defaultModel: "anthropic/claude-opus-4-5",
    resolvedVerboseLevel: "off",
    isNewSession: false,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    shouldInjectGroupIntro: false,
    typingMode: "instant",
  });
}

function mockUsageReply() {
  runEmbeddedPiAgentMock.mockResolvedValueOnce({
    payloads: [{ text: "ok" }],
    meta: {
      agentMeta: {
        provider: "anthropic",
        model: "claude",
        usage: { input: 12, output: 3 },
      },
    },
  });
  runWithModelFallbackMock.mockImplementationOnce(
    async ({ run }: { run: (provider: string, model: string) => Promise<unknown> }) => ({
      result: await run("anthropic", "claude"),
      provider: "anthropic",
      model: "claude",
    }),
  );
}

describe("runReplyAgent response usage footer", () => {
  beforeEach(() => {
    runEmbeddedPiAgentMock.mockReset();
    runWithModelFallbackMock.mockReset();
  });

  it("shows tokens when tokens flag is enabled", async () => {
    mockUsageReply();

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({ responseUsageFlags: { tokens: true }, sessionKey });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
    expect(String(payload?.text ?? "")).toContain("in /");
    expect(String(payload?.text ?? "")).toContain("out");
  });

  it("shows tokens and context when both flags are enabled", async () => {
    mockUsageReply();

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({
      responseUsageFlags: { tokens: true, context: true },
      sessionKey,
    });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
    expect(String(payload?.text ?? "")).toContain("% ctx");
  });

  it("does not show usage footer when no flags are set", async () => {
    mockUsageReply();

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({ responseUsageFlags: {}, sessionKey });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).not.toContain("Usage:");
    expect(String(payload?.text ?? "")).not.toContain("Context:");
  });

  it("uses channel defaults when session flags are missing", async () => {
    mockUsageReply();

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({
      sessionKey,
      config: {
        agents: {
          defaults: {
            responseUsageDefaultByChannel: {
              whatsapp: { tokens: true },
            },
          },
        },
      },
    });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
  });

  it("falls back to global defaults when no channel override is set", async () => {
    mockUsageReply();

    const sessionKey = "agent:main:telegram:dm:+1000";
    const res = await createRun({
      sessionKey,
      provider: "telegram",
      config: {
        agents: {
          defaults: {
            responseUsageDefault: { tokens: true },
          },
        },
      },
    });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).toContain("Usage:");
  });

  it("keeps session flags as the highest priority over config defaults", async () => {
    mockUsageReply();

    const sessionKey = "agent:main:whatsapp:dm:+1000";
    const res = await createRun({
      sessionKey,
      responseUsageFlags: {},
      config: {
        agents: {
          defaults: {
            responseUsageDefault: { tokens: true },
          },
        },
      },
    });
    const payload = Array.isArray(res) ? res[0] : res;
    expect(String(payload?.text ?? "")).not.toContain("Usage:");
  });
});
