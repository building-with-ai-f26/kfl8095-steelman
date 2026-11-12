// `npm run db:seed`: adds the demo board to the database named by
// DATABASE_URL, for `npm run dev`. Run `npm run db:migrate` first. Refuses if
// the demo board is already there.

import { DEMO_BOARD, seedDemoBoard } from "../demo-board.ts";
import { systemClock, systemIds } from "../system.ts";
import { createDatabase } from "./database.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL first (see app/.env.example).");
  process.exit(1);
}

const db = createDatabase(databaseUrl);
try {
  if (await db.selectFrom("board").select("id").where("id", "=", DEMO_BOARD).executeTakeFirst()) {
    console.log(`The demo board is already there: http://localhost:5173/b/${DEMO_BOARD}`);
  } else {
    await seedDemoBoard(db, systemClock, systemIds);
    console.log(`Added the demo board: http://localhost:5173/b/${DEMO_BOARD}`);
  }
} finally {
  await db.destroy();
}
