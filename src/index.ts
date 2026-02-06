#!/usr/bin/env node

import { createProgram } from './cli/index.js';

const program = createProgram();
program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
