/**
 * `@agent-mc/plugin-sdk/commands` — a private command channel between a plugin's panel and its
 * backend that AI agents on the person's computer cannot write to or replay.
 *
 * Backend: `createCommandChannel(ctx, { name, commands })`. Panel: `createCommandClient(name)`.
 * See the "Panel commands" guide for the whole picture.
 */
export {
  createCommandChannel,
  defineCommand,
  DEFAULT_COMMAND_LIMITS,
  RETIRED_ROW_NOTE,
} from './channel.js'
export type {
  CommandChannel,
  CommandChannelOptions,
  CommandLimits,
  CommandMapOf,
  CommandMode,
  CommandResult,
  CommandSpec,
  CommandSpecs,
  RetireRowsOptions,
} from './channel.js'
export { createCommandClient } from './client.js'
export type { CommandClient, CommandClientOptions, CommandMap, PendingStatus, RunOptions } from './client.js'
export { CommandError } from './errors.js'
export type { CommandErrorCode } from './errors.js'
