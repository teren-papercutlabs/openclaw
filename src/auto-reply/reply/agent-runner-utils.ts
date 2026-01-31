import type { NormalizedUsage } from "../../agents/usage.js";
import { getChannelDock } from "../../channels/dock.js";
import type { ChannelId, ChannelThreadingToolContext } from "../../channels/plugins/types.js";
import { normalizeAnyChannelId, normalizeChannelId } from "../../channels/registry.js";
import type { OpenClawConfig } from "../../config/config.js";
import { isReasoningTagProvider } from "../../utils/provider-utils.js";
import { estimateUsageCost, formatTokenCount, formatUsd } from "../../utils/usage-format.js";
import type { ResponseUsageFlags } from "../thinking.js";
import type { TemplateContext } from "../templating.js";
import type { ReplyPayload } from "../types.js";
import type { FollowupRun } from "./queue.js";

const BUN_FETCH_SOCKET_ERROR_RE = /socket connection was closed unexpectedly/i;

/**
 * Build provider-specific threading context for tool auto-injection.
 */
export function buildThreadingToolContext(params: {
  sessionCtx: TemplateContext;
  config: OpenClawConfig | undefined;
  hasRepliedRef: { value: boolean } | undefined;
}): ChannelThreadingToolContext {
  const { sessionCtx, config, hasRepliedRef } = params;
  if (!config) {
    return {};
  }
  const rawProvider = sessionCtx.Provider?.trim().toLowerCase();
  if (!rawProvider) {
    return {};
  }
  const provider = normalizeChannelId(rawProvider) ?? normalizeAnyChannelId(rawProvider);
  // Fallback for unrecognized/plugin channels (e.g., BlueBubbles before plugin registry init)
  const dock = provider ? getChannelDock(provider) : undefined;
  if (!dock?.threading?.buildToolContext) {
    return {
      currentChannelId: sessionCtx.To?.trim() || undefined,
      currentChannelProvider: provider ?? (rawProvider as ChannelId),
      hasRepliedRef,
    };
  }
  const context =
    dock.threading.buildToolContext({
      cfg: config,
      accountId: sessionCtx.AccountId,
      context: {
        Channel: sessionCtx.Provider,
        From: sessionCtx.From,
        To: sessionCtx.To,
        ChatType: sessionCtx.ChatType,
        ReplyToId: sessionCtx.ReplyToId,
        ThreadLabel: sessionCtx.ThreadLabel,
        MessageThreadId: sessionCtx.MessageThreadId,
      },
      hasRepliedRef,
    }) ?? {};
  return {
    ...context,
    currentChannelProvider: provider!, // guaranteed non-null since dock exists
  };
}

export const isBunFetchSocketError = (message?: string) =>
  Boolean(message && BUN_FETCH_SOCKET_ERROR_RE.test(message));

export const formatBunFetchSocketError = (message: string) => {
  const trimmed = message.trim();
  return [
    "⚠️ LLM connection failed. This could be due to server issues, network problems, or context length exceeded (e.g., with local LLMs like LM Studio). Original error:",
    "```",
    trimmed || "Unknown error",
    "```",
  ].join("\n");
};

/**
 * Format context usage for display.
 * Returns format like "30K (23%)" showing tokens and percentage of max context.
 */
export const formatContextPercent = (
  usedTokens: number | undefined,
  maxContext: number | undefined,
): string | null => {
  if (
    typeof usedTokens !== "number" ||
    typeof maxContext !== "number" ||
    maxContext <= 0 ||
    usedTokens < 0
  ) {
    return null;
  }
  const percent = Math.round((usedTokens / maxContext) * 100);
  // Format tokens with uppercase K (e.g., "30K")
  const tokensLabel = formatTokenCount(usedTokens).toUpperCase();
  return `${tokensLabel} (${percent}%)`;
};

/**
 * Format response usage line based on enabled flags.
 * Supports both legacy mode (showCost boolean) and new flags system.
 */
export const formatResponseUsageLine = (params: {
  usage?: NormalizedUsage;
  showCost: boolean;
  costConfig?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  /** New flags-based system (takes precedence when provided) */
  flags?: ResponseUsageFlags;
  /** Total tokens used in context (for context % calculation) */
  contextUsedTokens?: number;
  /** Max context window for the model */
  contextMaxTokens?: number;
}): string | null => {
  const usage = params.usage;
  if (!usage) {
    return null;
  }
  const input = usage.input;
  const output = usage.output;
  if (typeof input !== "number" && typeof output !== "number") {
    return null;
  }

  // Determine what to show based on flags or legacy mode
  const flags = params.flags;
  const showTokens = flags ? Boolean(flags.tokens) : true; // Legacy always shows tokens
  const showCost = flags ? Boolean(flags.cost) : params.showCost;
  const showContext = flags ? Boolean(flags.context) : false;

  // If nothing to show, return null
  if (!showTokens && !showCost && !showContext) {
    return null;
  }

  const parts: string[] = [];

  // Tokens portion
  if (showTokens) {
    const inputLabel = typeof input === "number" ? formatTokenCount(input) : "?";
    const outputLabel = typeof output === "number" ? formatTokenCount(output) : "?";
    parts.push(`Usage: ${inputLabel} in / ${outputLabel} out`);
  }

  // Cost portion
  if (showCost && typeof input === "number" && typeof output === "number") {
    const cost = estimateUsageCost({
      usage: {
        input,
        output,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
      },
      cost: params.costConfig,
    });
    const costLabel = formatUsd(cost);
    if (costLabel) {
      if (parts.length > 0) {
        parts.push(`est ${costLabel}`);
      } else {
        parts.push(`Cost: est ${costLabel}`);
      }
    }
  }

  // Context % portion
  if (showContext) {
    const contextLabel = formatContextPercent(params.contextUsedTokens, params.contextMaxTokens);
    if (contextLabel) {
      if (parts.length > 0) {
        parts.push(contextLabel);
      } else {
        parts.push(`Context: ${contextLabel}`);
      }
    }
  }

  if (parts.length === 0) {
    return null;
  }

  // Join parts with separator
  if (parts.length === 1) {
    return parts[0];
  }
  // First part is the main label, rest are appended with ·
  return `${parts[0]} · ${parts.slice(1).join(" · ")}`;
};

export const appendUsageLine = (payloads: ReplyPayload[], line: string): ReplyPayload[] => {
  let index = -1;
  for (let i = payloads.length - 1; i >= 0; i -= 1) {
    if (payloads[i]?.text) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    return [...payloads, { text: line }];
  }
  const existing = payloads[index];
  const existingText = existing.text ?? "";
  // Use -- separator for footer
  const trimmed = existingText.trimEnd();
  const next = {
    ...existing,
    text: `${trimmed}\n\n--\n${line}`,
  };
  const updated = payloads.slice();
  updated[index] = next;
  return updated;
};

export const resolveEnforceFinalTag = (run: FollowupRun["run"], provider: string) =>
  Boolean(run.enforceFinalTag || isReasoningTagProvider(provider));
