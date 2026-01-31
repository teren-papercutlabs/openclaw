import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { TemplateContext } from "../templating.js";
import {
  buildThreadingToolContext,
  formatContextPercent,
  formatResponseUsageLine,
} from "./agent-runner-utils.js";

describe("buildThreadingToolContext", () => {
  const cfg = {} as OpenClawConfig;

  it("uses conversation id for WhatsApp", () => {
    const sessionCtx = {
      Provider: "whatsapp",
      From: "123@g.us",
      To: "+15550001",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: cfg,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("123@g.us");
  });

  it("falls back to To for WhatsApp when From is missing", () => {
    const sessionCtx = {
      Provider: "whatsapp",
      To: "+15550001",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: cfg,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("+15550001");
  });

  it("uses the recipient id for other channels", () => {
    const sessionCtx = {
      Provider: "telegram",
      From: "user:42",
      To: "chat:99",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: cfg,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("chat:99");
  });

  it("uses the sender handle for iMessage direct chats", () => {
    const sessionCtx = {
      Provider: "imessage",
      ChatType: "direct",
      From: "imessage:+15550001",
      To: "chat_id:12",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: cfg,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("imessage:+15550001");
  });

  it("uses chat_id for iMessage groups", () => {
    const sessionCtx = {
      Provider: "imessage",
      ChatType: "group",
      From: "imessage:group:7",
      To: "chat_id:7",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: cfg,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("chat_id:7");
  });

  it("prefers MessageThreadId for Slack tool threading", () => {
    const sessionCtx = {
      Provider: "slack",
      To: "channel:C1",
      MessageThreadId: "123.456",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: { channels: { slack: { replyToMode: "all" } } } as OpenClawConfig,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("C1");
    expect(result.currentThreadTs).toBe("123.456");
  });
});

describe("formatContextPercent", () => {
  it("returns null for undefined values", () => {
    expect(formatContextPercent(undefined, 100000)).toBe(null);
    expect(formatContextPercent(5000, undefined)).toBe(null);
    expect(formatContextPercent(undefined, undefined)).toBe(null);
  });

  it("returns null for invalid values", () => {
    expect(formatContextPercent(5000, 0)).toBe(null);
    expect(formatContextPercent(5000, -100)).toBe(null);
    expect(formatContextPercent(-100, 100000)).toBe(null);
  });

  it("calculates percentage correctly", () => {
    expect(formatContextPercent(50000, 100000)).toBe("50% ctx");
    expect(formatContextPercent(67000, 100000)).toBe("67% ctx");
    expect(formatContextPercent(1000, 200000)).toBe("1% ctx");
    expect(formatContextPercent(199000, 200000)).toBe("100% ctx");
  });
});

describe("formatResponseUsageLine", () => {
  const usage = { input: 1200, output: 245, cacheRead: 0, cacheWrite: 0 };
  const costConfig = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

  describe("legacy mode (no flags)", () => {
    it("shows tokens only when showCost is false", () => {
      const result = formatResponseUsageLine({ usage, showCost: false });
      expect(result).toBe("Usage: 1.2k in / 245 out");
    });

    it("shows tokens and cost when showCost is true", () => {
      const result = formatResponseUsageLine({ usage, showCost: true, costConfig });
      expect(result).toContain("Usage: 1.2k in / 245 out");
      expect(result).toContain("est $");
    });

    it("returns null for undefined usage", () => {
      const result = formatResponseUsageLine({ usage: undefined, showCost: false });
      expect(result).toBe(null);
    });
  });

  describe("flags mode", () => {
    it("shows tokens only with tokens flag", () => {
      const result = formatResponseUsageLine({
        usage,
        showCost: false,
        flags: { tokens: true },
      });
      expect(result).toBe("Usage: 1.2k in / 245 out");
    });

    it("shows tokens and context with both flags", () => {
      const result = formatResponseUsageLine({
        usage,
        showCost: false,
        flags: { tokens: true, context: true },
        contextUsedTokens: 67000,
        contextMaxTokens: 100000,
      });
      expect(result).toBe("Usage: 1.2k in / 245 out · 67% ctx");
    });

    it("shows tokens, cost, and context with all flags", () => {
      const result = formatResponseUsageLine({
        usage,
        showCost: true,
        costConfig,
        flags: { tokens: true, cost: true, context: true },
        contextUsedTokens: 67000,
        contextMaxTokens: 100000,
      });
      expect(result).toContain("Usage: 1.2k in / 245 out");
      expect(result).toContain("est $");
      expect(result).toContain("67% ctx");
    });

    it("shows context only when only context flag is set", () => {
      const result = formatResponseUsageLine({
        usage,
        showCost: false,
        flags: { context: true },
        contextUsedTokens: 67000,
        contextMaxTokens: 100000,
      });
      expect(result).toBe("Context: 67%");
    });

    it("returns null when no flags are set", () => {
      const result = formatResponseUsageLine({
        usage,
        showCost: false,
        flags: {},
      });
      expect(result).toBe(null);
    });

    it("returns null when flags are all false", () => {
      const result = formatResponseUsageLine({
        usage,
        showCost: false,
        flags: { tokens: false, cost: false, context: false },
      });
      expect(result).toBe(null);
    });
  });
});
