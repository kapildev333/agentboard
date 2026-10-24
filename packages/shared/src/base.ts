import { z } from "zod";

// Shared by schemas.ts and extras.ts so the two never import each other.
export const nodeBase = {
  id: z.string(),
  title: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
};
