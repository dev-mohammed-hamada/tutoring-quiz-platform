import { createApp } from './app.js';
import { migrate } from './db/migrate.js';
import { seed } from './seed/index.js';
import { startSweeper } from './sweeper.js';

await migrate();
await seed();
startSweeper();

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => {
  console.log(`api listening on ${port}`);
});
