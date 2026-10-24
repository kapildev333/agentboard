export type Turn = { role: "user" | "assistant" | "tool"; text: string; tool?: { name: string; files?: string[] } };
