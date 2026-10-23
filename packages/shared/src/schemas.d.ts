import { z } from "zod";
export declare const AgentIdSchema: z.ZodEnum<{
    claude: "claude";
    codex: "codex";
    gemini: "gemini";
    opencode: "opencode";
    custom: "custom";
}>;
export declare const ConsoleStatusSchema: z.ZodEnum<{
    stopped: "stopped";
    starting: "starting";
    working: "working";
    idle: "idle";
    needs_you: "needs_you";
    exited: "exited";
}>;
export declare const SignalSchema: z.ZodEnum<{
    hooks: "hooks";
    plugin: "plugin";
    notify: "notify";
    heuristic: "heuristic";
}>;
export declare const DaemonInfoSchema: z.ZodObject<{
    port: z.ZodNumber;
    token: z.ZodString;
    pid: z.ZodNumber;
}, z.core.$strip>;
export declare const WorktreeSchema: z.ZodObject<{
    path: z.ZodString;
    branch: z.ZodString;
    base: z.ZodString;
}, z.core.$strip>;
export declare const ConsoleNodeSchema: z.ZodObject<{
    type: z.ZodLiteral<"console">;
    agent: z.ZodEnum<{
        claude: "claude";
        codex: "codex";
        gemini: "gemini";
        opencode: "opencode";
        custom: "custom";
    }>;
    cwd: z.ZodString;
    worktree: z.ZodOptional<z.ZodObject<{
        path: z.ZodString;
        branch: z.ZodString;
        base: z.ZodString;
    }, z.core.$strip>>;
    session: z.ZodOptional<z.ZodObject<{
        provider: z.ZodEnum<{
            claude: "claude";
            codex: "codex";
            gemini: "gemini";
            opencode: "opencode";
            custom: "custom";
        }>;
        id: z.ZodString;
    }, z.core.$strip>>;
    status: z.ZodEnum<{
        stopped: "stopped";
        starting: "starting";
        working: "working";
        idle: "idle";
        needs_you: "needs_you";
        exited: "exited";
    }>;
    createdAt: z.ZodString;
    lastActiveAt: z.ZodString;
    id: z.ZodString;
    title: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>;
export declare const NoteNodeSchema: z.ZodObject<{
    type: z.ZodLiteral<"note">;
    text: z.ZodString;
    id: z.ZodString;
    title: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>;
export declare const WebTileNodeSchema: z.ZodObject<{
    type: z.ZodLiteral<"webtile">;
    url: z.ZodString;
    id: z.ZodString;
    title: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>;
export declare const ChecklistNodeSchema: z.ZodObject<{
    type: z.ZodLiteral<"checklist">;
    items: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        done: z.ZodBoolean;
    }, z.core.$strip>>;
    id: z.ZodString;
    title: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>;
export declare const BoardNodeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"console">;
    agent: z.ZodEnum<{
        claude: "claude";
        codex: "codex";
        gemini: "gemini";
        opencode: "opencode";
        custom: "custom";
    }>;
    cwd: z.ZodString;
    worktree: z.ZodOptional<z.ZodObject<{
        path: z.ZodString;
        branch: z.ZodString;
        base: z.ZodString;
    }, z.core.$strip>>;
    session: z.ZodOptional<z.ZodObject<{
        provider: z.ZodEnum<{
            claude: "claude";
            codex: "codex";
            gemini: "gemini";
            opencode: "opencode";
            custom: "custom";
        }>;
        id: z.ZodString;
    }, z.core.$strip>>;
    status: z.ZodEnum<{
        stopped: "stopped";
        starting: "starting";
        working: "working";
        idle: "idle";
        needs_you: "needs_you";
        exited: "exited";
    }>;
    createdAt: z.ZodString;
    lastActiveAt: z.ZodString;
    id: z.ZodString;
    title: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"note">;
    text: z.ZodString;
    id: z.ZodString;
    title: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"webtile">;
    url: z.ZodString;
    id: z.ZodString;
    title: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"checklist">;
    items: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        done: z.ZodBoolean;
    }, z.core.$strip>>;
    id: z.ZodString;
    title: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    w: z.ZodNumber;
    h: z.ZodNumber;
}, z.core.$strip>], "type">;
export declare const WorkspaceSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    viewport: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        zoom: z.ZodNumber;
    }, z.core.$strip>;
    nodes: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"console">;
        agent: z.ZodEnum<{
            claude: "claude";
            codex: "codex";
            gemini: "gemini";
            opencode: "opencode";
            custom: "custom";
        }>;
        cwd: z.ZodString;
        worktree: z.ZodOptional<z.ZodObject<{
            path: z.ZodString;
            branch: z.ZodString;
            base: z.ZodString;
        }, z.core.$strip>>;
        session: z.ZodOptional<z.ZodObject<{
            provider: z.ZodEnum<{
                claude: "claude";
                codex: "codex";
                gemini: "gemini";
                opencode: "opencode";
                custom: "custom";
            }>;
            id: z.ZodString;
        }, z.core.$strip>>;
        status: z.ZodEnum<{
            stopped: "stopped";
            starting: "starting";
            working: "working";
            idle: "idle";
            needs_you: "needs_you";
            exited: "exited";
        }>;
        createdAt: z.ZodString;
        lastActiveAt: z.ZodString;
        id: z.ZodString;
        title: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"note">;
        text: z.ZodString;
        id: z.ZodString;
        title: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"webtile">;
        url: z.ZodString;
        id: z.ZodString;
        title: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"checklist">;
        items: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            done: z.ZodBoolean;
        }, z.core.$strip>>;
        id: z.ZodString;
        title: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
    }, z.core.$strip>], "type">>;
}, z.core.$strip>;
export declare const BoardSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    repoPath: z.ZodString;
    activeWorkspaceId: z.ZodString;
    workspaces: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        viewport: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            zoom: z.ZodNumber;
        }, z.core.$strip>;
        nodes: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"console">;
            agent: z.ZodEnum<{
                claude: "claude";
                codex: "codex";
                gemini: "gemini";
                opencode: "opencode";
                custom: "custom";
            }>;
            cwd: z.ZodString;
            worktree: z.ZodOptional<z.ZodObject<{
                path: z.ZodString;
                branch: z.ZodString;
                base: z.ZodString;
            }, z.core.$strip>>;
            session: z.ZodOptional<z.ZodObject<{
                provider: z.ZodEnum<{
                    claude: "claude";
                    codex: "codex";
                    gemini: "gemini";
                    opencode: "opencode";
                    custom: "custom";
                }>;
                id: z.ZodString;
            }, z.core.$strip>>;
            status: z.ZodEnum<{
                stopped: "stopped";
                starting: "starting";
                working: "working";
                idle: "idle";
                needs_you: "needs_you";
                exited: "exited";
            }>;
            createdAt: z.ZodString;
            lastActiveAt: z.ZodString;
            id: z.ZodString;
            title: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            w: z.ZodNumber;
            h: z.ZodNumber;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"note">;
            text: z.ZodString;
            id: z.ZodString;
            title: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            w: z.ZodNumber;
            h: z.ZodNumber;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"webtile">;
            url: z.ZodString;
            id: z.ZodString;
            title: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            w: z.ZodNumber;
            h: z.ZodNumber;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"checklist">;
            items: z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                done: z.ZodBoolean;
            }, z.core.$strip>>;
            id: z.ZodString;
            title: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            w: z.ZodNumber;
            h: z.ZodNumber;
        }, z.core.$strip>], "type">>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const ClientMessageSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    t: z.ZodLiteral<"attach">;
    consoleId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    t: z.ZodLiteral<"input">;
    consoleId: z.ZodString;
    data: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    t: z.ZodLiteral<"resize">;
    consoleId: z.ZodString;
    cols: z.ZodNumber;
    rows: z.ZodNumber;
}, z.core.$strip>], "t">;
export declare const DaemonMessageSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    t: z.ZodLiteral<"output">;
    consoleId: z.ZodString;
    data: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    t: z.ZodLiteral<"status">;
    consoleId: z.ZodString;
    status: z.ZodEnum<{
        stopped: "stopped";
        starting: "starting";
        working: "working";
        idle: "idle";
        needs_you: "needs_you";
        exited: "exited";
    }>;
}, z.core.$strip>, z.ZodObject<{
    t: z.ZodLiteral<"exit">;
    consoleId: z.ZodString;
    code: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    t: z.ZodLiteral<"board">;
    board: z.ZodObject<{
        version: z.ZodLiteral<1>;
        repoPath: z.ZodString;
        activeWorkspaceId: z.ZodString;
        workspaces: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            viewport: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
                zoom: z.ZodNumber;
            }, z.core.$strip>;
            nodes: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                type: z.ZodLiteral<"console">;
                agent: z.ZodEnum<{
                    claude: "claude";
                    codex: "codex";
                    gemini: "gemini";
                    opencode: "opencode";
                    custom: "custom";
                }>;
                cwd: z.ZodString;
                worktree: z.ZodOptional<z.ZodObject<{
                    path: z.ZodString;
                    branch: z.ZodString;
                    base: z.ZodString;
                }, z.core.$strip>>;
                session: z.ZodOptional<z.ZodObject<{
                    provider: z.ZodEnum<{
                        claude: "claude";
                        codex: "codex";
                        gemini: "gemini";
                        opencode: "opencode";
                        custom: "custom";
                    }>;
                    id: z.ZodString;
                }, z.core.$strip>>;
                status: z.ZodEnum<{
                    stopped: "stopped";
                    starting: "starting";
                    working: "working";
                    idle: "idle";
                    needs_you: "needs_you";
                    exited: "exited";
                }>;
                createdAt: z.ZodString;
                lastActiveAt: z.ZodString;
                id: z.ZodString;
                title: z.ZodString;
                x: z.ZodNumber;
                y: z.ZodNumber;
                w: z.ZodNumber;
                h: z.ZodNumber;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"note">;
                text: z.ZodString;
                id: z.ZodString;
                title: z.ZodString;
                x: z.ZodNumber;
                y: z.ZodNumber;
                w: z.ZodNumber;
                h: z.ZodNumber;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"webtile">;
                url: z.ZodString;
                id: z.ZodString;
                title: z.ZodString;
                x: z.ZodNumber;
                y: z.ZodNumber;
                w: z.ZodNumber;
                h: z.ZodNumber;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"checklist">;
                items: z.ZodArray<z.ZodObject<{
                    text: z.ZodString;
                    done: z.ZodBoolean;
                }, z.core.$strip>>;
                id: z.ZodString;
                title: z.ZodString;
                x: z.ZodNumber;
                y: z.ZodNumber;
                w: z.ZodNumber;
                h: z.ZodNumber;
            }, z.core.$strip>], "type">>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>], "t">;
export declare const OkSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, z.core.$strip>;
export declare const BoardQuerySchema: z.ZodObject<{
    repo: z.ZodString;
}, z.core.$strip>;
export declare const SpawnConsoleRequestSchema: z.ZodObject<{
    agent: z.ZodEnum<{
        claude: "claude";
        codex: "codex";
        gemini: "gemini";
        opencode: "opencode";
        custom: "custom";
    }>;
    cwd: z.ZodString;
    worktree: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    callerConsoleId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const AgentInfoSchema: z.ZodObject<{
    id: z.ZodEnum<{
        claude: "claude";
        codex: "codex";
        gemini: "gemini";
        opencode: "opencode";
        custom: "custom";
    }>;
    command: z.ZodString;
    version: z.ZodNullable<z.ZodString>;
    available: z.ZodBoolean;
}, z.core.$strip>;
export declare const AgentInfoListSchema: z.ZodArray<z.ZodObject<{
    id: z.ZodEnum<{
        claude: "claude";
        codex: "codex";
        gemini: "gemini";
        opencode: "opencode";
        custom: "custom";
    }>;
    command: z.ZodString;
    version: z.ZodNullable<z.ZodString>;
    available: z.ZodBoolean;
}, z.core.$strip>>;
export declare const StatusResponseSchema: z.ZodObject<{
    consoles: z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"console">;
        agent: z.ZodEnum<{
            claude: "claude";
            codex: "codex";
            gemini: "gemini";
            opencode: "opencode";
            custom: "custom";
        }>;
        cwd: z.ZodString;
        worktree: z.ZodOptional<z.ZodObject<{
            path: z.ZodString;
            branch: z.ZodString;
            base: z.ZodString;
        }, z.core.$strip>>;
        session: z.ZodOptional<z.ZodObject<{
            provider: z.ZodEnum<{
                claude: "claude";
                codex: "codex";
                gemini: "gemini";
                opencode: "opencode";
                custom: "custom";
            }>;
            id: z.ZodString;
        }, z.core.$strip>>;
        status: z.ZodEnum<{
            stopped: "stopped";
            starting: "starting";
            working: "working";
            idle: "idle";
            needs_you: "needs_you";
            exited: "exited";
        }>;
        createdAt: z.ZodString;
        lastActiveAt: z.ZodString;
        id: z.ZodString;
        title: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        w: z.ZodNumber;
        h: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const HookRequestSchema: z.ZodObject<{
    agent: z.ZodEnum<{
        claude: "claude";
        codex: "codex";
        gemini: "gemini";
        opencode: "opencode";
        custom: "custom";
    }>;
    event: z.ZodString;
    payload: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export declare const GitPathQuerySchema: z.ZodObject<{
    path: z.ZodString;
}, z.core.$strip>;
export declare const GitStatusSchema: z.ZodObject<{
    branch: z.ZodString;
    ahead: z.ZodNumber;
    behind: z.ZodNumber;
    dirty: z.ZodNumber;
    lastCommit: z.ZodNullable<z.ZodObject<{
        sha: z.ZodString;
        subject: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const GitDiffSchema: z.ZodObject<{
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        status: z.ZodString;
    }, z.core.$strip>>;
    patch: z.ZodString;
}, z.core.$strip>;
export declare const WorktreeRequestSchema: z.ZodObject<{
    repo: z.ZodString;
    name: z.ZodString;
    base: z.ZodString;
}, z.core.$strip>;
export declare const CommitRequestSchema: z.ZodObject<{
    path: z.ZodString;
    message: z.ZodString;
}, z.core.$strip>;
export declare const CommitResponseSchema: z.ZodObject<{
    sha: z.ZodString;
}, z.core.$strip>;
export declare const PushRequestSchema: z.ZodObject<{
    path: z.ZodString;
}, z.core.$strip>;
export declare const PrRequestSchema: z.ZodObject<{
    path: z.ZodString;
    title: z.ZodString;
    body: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const PrResponseSchema: z.ZodObject<{
    url: z.ZodString;
}, z.core.$strip>;
