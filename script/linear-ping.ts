import { getViewer, listTeams, LinearAPIError } from "../server/integrations/linear";

async function main() {
  try {
    const viewer = await getViewer();
    console.log(`viewer: ${viewer.name} <${viewer.email}> (${viewer.id})`);

    const teams = await listTeams();
    console.log(`teams (${teams.length}):`);
    for (const t of teams) {
      console.log(`  - ${t.key.padEnd(8)} ${t.name}  (${t.id})`);
    }

    process.exit(0);
  } catch (err) {
    if (err instanceof LinearAPIError) {
      console.error(`linear error (status=${err.httpStatus ?? "n/a"}): ${err.message}`);
      if (err.graphqlErrors) {
        for (const ge of err.graphqlErrors) console.error(`  - ${ge.message}`);
      }
    } else {
      console.error("linear ping failed:", err);
    }
    process.exit(1);
  }
}

main();
