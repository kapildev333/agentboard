import type * as schemas from "./schemas.js";
export type SchemaName = keyof typeof schemas;
export declare const routes: readonly [{
    readonly method: "GET";
    readonly path: "/api/board";
    readonly request: "BoardQuerySchema";
    readonly response: "BoardSchema";
}, {
    readonly method: "PUT";
    readonly path: "/api/board";
    readonly request: "BoardSchema";
    readonly response: "OkSchema";
}, {
    readonly method: "POST";
    readonly path: "/api/consoles";
    readonly request: "SpawnConsoleRequestSchema";
    readonly response: "ConsoleNodeSchema";
}, {
    readonly method: "DELETE";
    readonly path: "/api/consoles/:id";
    readonly request: null;
    readonly response: "OkSchema";
}, {
    readonly method: "POST";
    readonly path: "/api/consoles/:id/resume";
    readonly request: null;
    readonly response: "ConsoleNodeSchema";
}, {
    readonly method: "GET";
    readonly path: "/api/agents";
    readonly request: null;
    readonly response: "AgentInfoListSchema";
}, {
    readonly method: "GET";
    readonly path: "/api/status";
    readonly request: null;
    readonly response: "StatusResponseSchema";
}, {
    readonly method: "POST";
    readonly path: "/hook/:consoleId";
    readonly request: "HookRequestSchema";
    readonly response: "OkSchema";
}, {
    readonly method: "GET";
    readonly path: "/api/git/status";
    readonly request: "GitPathQuerySchema";
    readonly response: "GitStatusSchema";
}, {
    readonly method: "GET";
    readonly path: "/api/git/diff";
    readonly request: "GitPathQuerySchema";
    readonly response: "GitDiffSchema";
}, {
    readonly method: "POST";
    readonly path: "/api/git/worktree";
    readonly request: "WorktreeRequestSchema";
    readonly response: "WorktreeSchema";
}, {
    readonly method: "POST";
    readonly path: "/api/git/commit";
    readonly request: "CommitRequestSchema";
    readonly response: "CommitResponseSchema";
}, {
    readonly method: "POST";
    readonly path: "/api/git/push";
    readonly request: "PushRequestSchema";
    readonly response: "OkSchema";
}, {
    readonly method: "POST";
    readonly path: "/api/git/pr";
    readonly request: "PrRequestSchema";
    readonly response: "PrResponseSchema";
}];
