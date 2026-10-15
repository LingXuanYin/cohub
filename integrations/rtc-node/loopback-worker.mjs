import { loopback } from "./loopback.mjs";
let code = 0;
try { await loopback(); process.stdout.write("Audio, video and DataChannel loopback passed.\n"); }
catch (cause) { console.error(cause); code = 1; }
await new Promise((done) => process.stdout.write("", done));
process.exit(code);
