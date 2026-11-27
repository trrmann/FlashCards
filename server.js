/**
 * FlashCards application entry point.
 * All server behavior lives in the class-based Server module.
 */

import { Server } from './src/scripts/js/modules/server.mjs';

new Server().start();
