// `npm run db:seed`: adds the demo board and the prototype's example boards
// (with their people as test accounts) to the database named by
// DATABASE_URL, for `npm run dev`. Run `npm run db:migrate` first. Boards
// already there are left as they are, so it's safe to run again.

import { DEMO_BOARD, seedDemoBoard } from "../demo-board.ts";
import { EXAMPLE_BOARDS, seedExampleBoards } from "../example-boards.ts";
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
  const added = await seedExampleBoards(db, systemClock, systemIds);
  for (const example of EXAMPLE_BOARDS) {
    console.log(`${added.includes(example.id) ? "Added" : "Already there"}: http://localhost:5173/b/${example.id}  ${example.question}`);
  }
} finally {
  await db.destroy();
}
