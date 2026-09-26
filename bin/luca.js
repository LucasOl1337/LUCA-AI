#!/usr/bin/env node
import { main } from '../cli/main.js';
import { CliError, redact } from '../cli/io.js';

process.stdout.on('error', error => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

try {
  await main();
} catch (error) {
  const known = error instanceof CliError;
  process.stderr.write(`${JSON.stringify({ ok: false, error: {
    code: known ? error.code : error.code || 'cli_error',
    message: error.message,
    ...(known ? redact(error.details) : {}),
  } })}\n`);
  process.exitCode = known ? error.exitCode : 2;
}
