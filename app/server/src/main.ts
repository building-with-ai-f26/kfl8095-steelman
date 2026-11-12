import { buildApp } from "./app.ts";
import { systemClock, systemIds } from "./system.ts";

// PORT is set by `npm run dev` locally and by the host when deployed.
const port = Number(process.env.PORT || 3000);

const app = buildApp({ clock: systemClock, ids: systemIds });
await app.listen({ port, host: "127.0.0.1" });
console.log(`Steelman service listening on http://127.0.0.1:${port}`);
