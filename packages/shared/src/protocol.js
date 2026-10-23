import { ClientMessageSchema, DaemonMessageSchema } from "./schemas.js";
/** Throws a ZodError when raw is not a client message. */
export const parseClientMessage = (raw) => ClientMessageSchema.parse(raw);
/** Throws a ZodError when raw is not a daemon message. */
export const parseDaemonMessage = (raw) => DaemonMessageSchema.parse(raw);
