import { main } from "./index.js";

main(process.argv.slice(2)).then(
  (code) => {
    if (code) process.exit(code);
  },
  (e: Error) => {
    console.error(`agentboard: ${e.message}`);
    process.exit(1);
  },
);
