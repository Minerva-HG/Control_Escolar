import { createApp } from './app.js';
import { config } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { pool, waitForDatabase } from './db/pool.js';

// En false el esquema se migra aparte (docker compose run --rm migrate), para controlar el
// momento del cambio de esquema cuando hay varias replicas del servidor.
const RUN_MIGRATIONS = process.env.RUN_MIGRATIONS !== 'false';

async function main() {
  await waitForDatabase();
  if (RUN_MIGRATIONS) await runMigrations();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] ${config.school.name} - escuchando en http://localhost:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} recibido, cerrando...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[server] no se pudo iniciar:', error.message);
  process.exit(1);
});
