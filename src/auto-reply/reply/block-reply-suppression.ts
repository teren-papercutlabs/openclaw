import type { OpenClawConfig } from "../../config/config.js";
import type { MessagingToolSend } from "../../agents/pi-embedded-runner.js";
import type { OriginatingChannelType } from "../templating.js";
import { shouldSuppressMessagingToolReplies } from "./reply-payloads.js";

export function shouldSuppressBlockRepliesOnMessageToolSend(params: {
  cfg: OpenClawConfig;
  messagingToolSentTargets?: MessagingToolSend[];
  originatingChannel?: OriginatingChannelType | string;
  originatingTo?: string;
  accountId?: string;
}): boolean {
  const enabled = params.cfg.agents?.defaults?.suppressBlockRepliesOnMessageToolSend;
  if (enabled === false) {
    return false;
  }
  return shouldSuppressMessagingToolReplies({
    messageProvider: params.originatingChannel,
    messagingToolSentTargets: params.messagingToolSentTargets,
    originatingTo: params.originatingTo,
    accountId: params.accountId,
  });
}
