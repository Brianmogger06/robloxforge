import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HttpBridge } from "./transport/httpBridge.js";
import { registerCoreTools } from "./tools/core.js";

const config = loadConfig();
const bridge = new HttpBridge(config.port);

const server = new Server(
  { name: "robloxforge", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

registerCoreTools(server, bridge, config);

await bridge.start();

const transport = new StdioServerTransport();
await server.connect(transport);
