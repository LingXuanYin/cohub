import type { Command } from "commander";

export function registerHost(program: Command): void {
  program
    .command("host", { hidden: true })
    .description("Machine interface for native desktop hosts")
    .command("serve")
    .description("Answer host bridge requests over stdio, one JSON message per line")
    .action(async () => {
      const { serveHost } = await import("../host/serve.js");
      await serveHost();
    });
}
