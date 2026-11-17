// `npm run db:migrate`: brings the database named by DATABASE_URL up to date.
//
// Deployed, the migration job (M1-14b) signs in as the database's owner and
// also creates the service's own login (service-login.ts), named by
// SERVICE_DATABASE_USER with SERVICE_DATABASE_PASSWORD.

import { migrate } from "./migrate.ts";
import { provisionServiceLogin } from "./service-login.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL first (see app/.env.example).");
  process.exit(1);
}

const { applied } = await migrate(databaseUrl);
console.log(applied.length > 0 ? `Applied ${applied.length}:\n  ${applied.join("\n  ")}` : "Nothing to apply: the database is up to date.");

const { SERVICE_DATABASE_USER: name, SERVICE_DATABASE_PASSWORD: password } = process.env;
if (name && password) {
  await provisionServiceLogin(databaseUrl, { name, password });
  console.log(`The service's login, ${name}, is ready.`);
} else if (name || password) {
  console.error("Set both SERVICE_DATABASE_USER and SERVICE_DATABASE_PASSWORD, or neither.");
  process.exit(1);
}
