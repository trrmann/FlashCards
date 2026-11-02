#!/usr/bin/env node
import { flashCardsDb } from './modules/db/flashCardsDb.mjs';

async function initializeDatabase() {
  await flashCardsDb.initializeSchema();
}

initializeDatabase().catch((error) => {
  console.error('Database initialization failed:', error);
  process.exitCode = 1;
});
