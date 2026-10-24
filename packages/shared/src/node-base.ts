import { z } from "zod";

// Own module so schemas.ts and extras.ts can both import it without a cycle.
export const nodeBase = {
  id: z.string(),
  title: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
};
