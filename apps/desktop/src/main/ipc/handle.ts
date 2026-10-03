import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import type { ChannelArgs, ChannelName, ChannelResult } from '../../shared/ipc.js';

/**
 * Typed `ipcMain.handle` wrapper.
 *
 *  - The channel name, argument tuple and return type are checked against the
 *    shared `IpcChannels` map at compile time.
 *  - Every channel that takes arguments must supply one zod schema per
 *    argument; they are validated before the handler runs and the parsed
 *    values are what the handler receives. Invalid input rejects the
 *    renderer's `invoke()` promise with an `IpcValidationError` and never
 *    reaches business logic.
 *  - A process-wide sender guard (see `setIpcSenderGuard`) rejects calls from
 *    frames that are not the app's own renderer.
 */

/** One zod schema per positional argument of channel `C`. */
type SchemaTuple<T extends readonly unknown[]> = {
  readonly [K in keyof T]-?: z.ZodType<T[K], z.ZodTypeDef, unknown>;
};
export type ArgSchemas<C extends ChannelName> = SchemaTuple<ChannelArgs<C>>;

export type IpcHandler<C extends ChannelName> = (
  ...args: ChannelArgs<C>
) => ChannelResult<C> | Promise<ChannelResult<C>>;

type HandleRest<C extends ChannelName> = ChannelArgs<C> extends []
  ? [handler: IpcHandler<C>]
  : [schemas: ArgSchemas<C>, handler: IpcHandler<C>];

export class IpcValidationError extends Error {
  constructor(
    readonly channel: string,
    readonly issues: string[]
  ) {
    super(`Invalid arguments for IPC channel "${channel}": ${issues.join('; ')}`);
    this.name = 'IpcValidationError';
  }
}

export type IpcSenderGuard = (event: IpcMainInvokeEvent) => boolean;

let senderGuard: IpcSenderGuard = () => true;

/** Installs the check every invoke must pass before its handler runs. */
export function setIpcSenderGuard(guard: IpcSenderGuard): void {
  senderGuard = guard;
}

function formatIssues(index: number, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = [`arg${index}`, ...issue.path].join('.');
    return `${where}: ${issue.message}`;
  });
}

/**
 * Validates raw invoke arguments against per-argument schemas. Extra trailing
 * arguments beyond the schema list are ignored (the handlers never read them).
 */
export function validateArgs<C extends ChannelName>(
  channel: C,
  schemas: ArgSchemas<C>,
  raw: readonly unknown[]
): ChannelArgs<C> {
  const list = schemas as unknown as readonly z.ZodTypeAny[];
  const issues: string[] = [];
  const parsed: unknown[] = [];
  list.forEach((schema, i) => {
    const res = schema.safeParse(raw[i]);
    if (res.success) {
      parsed.push(res.data);
    } else {
      issues.push(...formatIssues(i, res.error));
    }
  });
  if (issues.length) throw new IpcValidationError(channel, issues);
  return parsed as ChannelArgs<C>;
}

/** Builds the raw listener `ipcMain.handle` receives (exported for tests). */
export function createListener<C extends ChannelName>(
  channel: C,
  ...rest: HandleRest<C>
): (event: IpcMainInvokeEvent, ...raw: unknown[]) => Promise<ChannelResult<C>> {
  const [schemas, handler] = (rest.length === 1 ? [undefined, rest[0]] : rest) as [
    ArgSchemas<C> | undefined,
    IpcHandler<C>,
  ];
  return async (event, ...raw) => {
    if (!senderGuard(event)) {
      throw new Error(`Blocked IPC "${channel}" from an untrusted sender.`);
    }
    const args = schemas ? validateArgs(channel, schemas, raw) : ([] as unknown as ChannelArgs<C>);
    return handler(...args);
  };
}

/** Registers a typed, validated handler for an invoke channel. */
export function handle<C extends ChannelName>(channel: C, ...rest: HandleRest<C>): void {
  ipcMain.handle(channel, createListener(channel, ...rest));
}
