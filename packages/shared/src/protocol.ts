import { ClientMessageSchema, DaemonMessageSchema } from "./schemas.js";
import type { ClientMessage, DaemonMessage } from "./types.js";

/** Throws a ZodError when raw is not a client message. */
export const parseClientMessage = (raw: unknown): ClientMessage => ClientMessageSchema.parse(raw);

/** Throws a ZodError when raw is not a daemon message. */
export const parseDaemonMessage = (raw: unknown): DaemonMessage => DaemonMessageSchema.parse(raw);
