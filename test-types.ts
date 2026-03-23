import { createOpencodeClient } from '@opencode-ai/sdk/v2'
type CreateArgs = Parameters<ReturnType<typeof createOpencodeClient>["session"]["create"]>[0];
const args: CreateArgs = { directory: 'a' };
