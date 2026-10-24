import { z } from "zod";
import { nodeBase } from "./base.js";

// Phase 3: board extras (text, image, ink, layouts, assets, preview).
export const TextNodeSchema = z.object({ ...nodeBase, type: z.literal("text"), markdown: z.string() });
export const ImageNodeSchema = z.object({
  ...nodeBase,
  type: z.literal("image"),
  assetId: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().default(""),
});
export const StrokeSchema = z.object({
  id: z.string(),
  points: z.array(z.tuple([z.number(), z.number()])).min(2),
  color: z.string(),
  width: z.number().positive(),
});
export const SavedLayoutSchema = z.object({
  name: z.string().min(1),
  nodes: z.record(z.string(), z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })),
});
export const AssetUploadResponseSchema = z.object({
  id: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export const PreviewInfoSchema = z.object({ key: z.string().length(32) });
/** Marks a route whose body is not JSON (raw bytes). It accepts anything; the daemon and page handle the bytes. */
export const BinarySchema = z.unknown();
