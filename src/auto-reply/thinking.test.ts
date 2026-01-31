import { describe, expect, it } from "vitest";
import {
  cycleUsageFlags,
  formatUsageFlags,
  hasAnyUsageFlag,
  legacyUsageModeToFlags,
  listThinkingLevelLabels,
  listThinkingLevels,
  normalizeReasoningLevel,
  normalizeThinkLevel,
  parseUsageToggleArg,
} from "./thinking.js";

describe("normalizeThinkLevel", () => {
  it("accepts mid as medium", () => {
    expect(normalizeThinkLevel("mid")).toBe("medium");
  });

  it("accepts xhigh", () => {
    expect(normalizeThinkLevel("xhigh")).toBe("xhigh");
  });

  it("accepts on as low", () => {
    expect(normalizeThinkLevel("on")).toBe("low");
  });
});

describe("listThinkingLevels", () => {
  it("includes xhigh for codex models", () => {
    expect(listThinkingLevels(undefined, "gpt-5.2-codex")).toContain("xhigh");
  });

  it("includes xhigh for openai gpt-5.2", () => {
    expect(listThinkingLevels("openai", "gpt-5.2")).toContain("xhigh");
  });

  it("excludes xhigh for non-codex models", () => {
    expect(listThinkingLevels(undefined, "gpt-4.1-mini")).not.toContain("xhigh");
  });
});

describe("listThinkingLevelLabels", () => {
  it("returns on/off for ZAI", () => {
    expect(listThinkingLevelLabels("zai", "glm-4.7")).toEqual(["off", "on"]);
  });

  it("returns full levels for non-ZAI", () => {
    expect(listThinkingLevelLabels("openai", "gpt-4.1-mini")).toContain("low");
    expect(listThinkingLevelLabels("openai", "gpt-4.1-mini")).not.toContain("on");
  });
});

describe("normalizeReasoningLevel", () => {
  it("accepts on/off", () => {
    expect(normalizeReasoningLevel("on")).toBe("on");
    expect(normalizeReasoningLevel("off")).toBe("off");
  });

  it("accepts show/hide", () => {
    expect(normalizeReasoningLevel("show")).toBe("on");
    expect(normalizeReasoningLevel("hide")).toBe("off");
  });

  it("accepts stream", () => {
    expect(normalizeReasoningLevel("stream")).toBe("stream");
    expect(normalizeReasoningLevel("streaming")).toBe("stream");
  });
});

describe("parseUsageToggleArg", () => {
  it("parses tokens variations", () => {
    expect(parseUsageToggleArg("tokens")).toBe("tokens");
    expect(parseUsageToggleArg("token")).toBe("tokens");
    expect(parseUsageToggleArg("tok")).toBe("tokens");
    expect(parseUsageToggleArg("TOKENS")).toBe("tokens");
  });

  it("parses context variations", () => {
    expect(parseUsageToggleArg("context")).toBe("context");
    expect(parseUsageToggleArg("ctx")).toBe("context");
    expect(parseUsageToggleArg("CONTEXT")).toBe("context");
  });

  it("parses off variations", () => {
    expect(parseUsageToggleArg("off")).toBe("off");
    expect(parseUsageToggleArg("disable")).toBe("off");
    expect(parseUsageToggleArg("none")).toBe("off");
    expect(parseUsageToggleArg("clear")).toBe("off");
  });

  it("returns undefined for unknown args", () => {
    expect(parseUsageToggleArg("cost")).toBe(undefined);
    expect(parseUsageToggleArg("full")).toBe(undefined);
    expect(parseUsageToggleArg("invalid")).toBe(undefined);
  });

  it("returns undefined for empty/null", () => {
    expect(parseUsageToggleArg("")).toBe(undefined);
    expect(parseUsageToggleArg(null)).toBe(undefined);
    expect(parseUsageToggleArg(undefined)).toBe(undefined);
  });
});

describe("hasAnyUsageFlag", () => {
  it("returns false for empty/undefined flags", () => {
    expect(hasAnyUsageFlag(undefined)).toBe(false);
    expect(hasAnyUsageFlag(null)).toBe(false);
    expect(hasAnyUsageFlag({})).toBe(false);
    expect(hasAnyUsageFlag({ tokens: false, cost: false, context: false })).toBe(false);
  });

  it("returns true when any flag is enabled", () => {
    expect(hasAnyUsageFlag({ tokens: true })).toBe(true);
    expect(hasAnyUsageFlag({ cost: true })).toBe(true);
    expect(hasAnyUsageFlag({ context: true })).toBe(true);
    expect(hasAnyUsageFlag({ tokens: true, context: true })).toBe(true);
  });
});

describe("legacyUsageModeToFlags", () => {
  it("converts off to undefined", () => {
    expect(legacyUsageModeToFlags("off")).toBe(undefined);
    expect(legacyUsageModeToFlags(null)).toBe(undefined);
    expect(legacyUsageModeToFlags(undefined)).toBe(undefined);
  });

  it("converts tokens to tokens flag", () => {
    expect(legacyUsageModeToFlags("tokens")).toEqual({ tokens: true });
    expect(legacyUsageModeToFlags("on")).toEqual({ tokens: true });
  });

  it("converts full to tokens + cost flags", () => {
    expect(legacyUsageModeToFlags("full")).toEqual({ tokens: true, cost: true });
  });
});

describe("cycleUsageFlags", () => {
  it("cycles from off to tokens", () => {
    expect(cycleUsageFlags(undefined)).toEqual({ tokens: true });
    expect(cycleUsageFlags({})).toEqual({ tokens: true });
  });

  it("cycles from tokens to tokens+context", () => {
    expect(cycleUsageFlags({ tokens: true })).toEqual({ tokens: true, context: true });
  });

  it("cycles from tokens+context to off", () => {
    expect(cycleUsageFlags({ tokens: true, context: true })).toEqual({});
  });

  it("cycles from any other combo to off", () => {
    expect(cycleUsageFlags({ tokens: true, cost: true })).toEqual({});
    expect(cycleUsageFlags({ tokens: true, cost: true, context: true })).toEqual({});
  });
});

describe("formatUsageFlags", () => {
  it("returns off for empty/undefined flags", () => {
    expect(formatUsageFlags(undefined)).toBe("off");
    expect(formatUsageFlags(null)).toBe("off");
    expect(formatUsageFlags({})).toBe("off");
  });

  it("formats single flags", () => {
    expect(formatUsageFlags({ tokens: true })).toBe("tokens");
    expect(formatUsageFlags({ cost: true })).toBe("cost");
    expect(formatUsageFlags({ context: true })).toBe("context");
  });

  it("formats combined flags with + separator", () => {
    expect(formatUsageFlags({ tokens: true, context: true })).toBe("tokens+context");
    expect(formatUsageFlags({ tokens: true, cost: true })).toBe("tokens+cost");
    expect(formatUsageFlags({ tokens: true, cost: true, context: true })).toBe(
      "tokens+cost+context",
    );
  });
});
