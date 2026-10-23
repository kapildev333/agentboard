#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DaemonClient, readDaemonInfo } from "./client.js";
import { createServer } from "./server.js";

await createServer(new DaemonClient(() => readDaemonInfo())).connect(new StdioServerTransport());
