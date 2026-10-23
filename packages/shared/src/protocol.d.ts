import type { ClientMessage, DaemonMessage } from "./types.js";
/** Throws a ZodError when raw is not a client message. */
export declare const parseClientMessage: (raw: unknown) => ClientMessage;
/** Throws a ZodError when raw is not a daemon message. */
export declare const parseDaemonMessage: (raw: unknown) => DaemonMessage;
