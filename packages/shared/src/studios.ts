import { z } from "zod";

// Phase 6 studios (L60). Every path is repository-relative with POSIX separators; the daemon resolves it under `repo`.
export const FilesQuerySchema = z.object({ repo: z.string(), path: z.string().optional() });
export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.enum(["file", "dir"]),
  status: z.enum(["M", "A", "D", "?"]).optional(),
});
export const FileTreeSchema = z.object({ path: z.string(), entries: z.array(FileEntrySchema) });
/** text is null when the file is binary or over 1 MB. */
export const FileContentSchema = z.object({
  path: z.string(),
  size: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
  text: z.string().nullable(),
  language: z.string(),
});
export const FileWriteRequestSchema = z.object({ repo: z.string(), path: z.string(), text: z.string() });
export const ConsoleInputSchema = z.object({ data: z.string() });

export const VaultQuerySchema = z.object({ repo: z.string() });
export const VaultIndexSchema = z.object({
  root: z.string(),
  notes: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      folder: z.string(),
      mtime: z.number(),
      links: z.array(z.string()),
      backlinks: z.array(z.string()),
    }),
  ),
});
export const VaultNoteQuerySchema = z.object({ repo: z.string(), path: z.string() });
export const VaultNoteSchema = z.object({
  path: z.string(),
  title: z.string(),
  text: z.string(),
  mtime: z.number(),
  links: z.array(z.string()),
  backlinks: z.array(z.object({ path: z.string(), title: z.string(), excerpt: z.string() })),
});
/** A write carrying an mtime older than the file's answers 409. */
export const VaultWriteSchema = z.object({ repo: z.string(), path: z.string(), text: z.string(), mtime: z.number().optional() });
export const VaultAppendSchema = z.object({ repo: z.string(), path: z.string(), text: z.string(), author: z.string() });

export type FilesQuery = z.infer<typeof FilesQuerySchema>;
export type FileEntry = z.infer<typeof FileEntrySchema>;
export type FileTree = z.infer<typeof FileTreeSchema>;
export type FileContent = z.infer<typeof FileContentSchema>;
export type FileWriteRequest = z.infer<typeof FileWriteRequestSchema>;
export type ConsoleInput = z.infer<typeof ConsoleInputSchema>;
export type VaultIndex = z.infer<typeof VaultIndexSchema>;
export type VaultNote = z.infer<typeof VaultNoteSchema>;
export type VaultWrite = z.infer<typeof VaultWriteSchema>;
export type VaultAppend = z.infer<typeof VaultAppendSchema>;
