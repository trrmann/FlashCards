#!/usr/bin/env node
import { initializeDatabaseSchema } from './modules/db/postGres.mjs';

// Run initialization
initializeDatabaseSchema();
