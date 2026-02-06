import { Command } from 'commander';
import { loadConfig, initConfig, getConfigPath } from '../config/index.js';
import { redactObject } from '../util/redact.js';
import { formatError } from '../util/errors.js';

export const configCommand = new Command('config').description('Manage configuration');

// ── config init ───────────────────────────────────────────────

configCommand
  .command('init')
  .description('Create a starter configuration file')
  .option('--with-secrets', 'Include placeholder API key in the config file')
  .action(async (opts) => {
    try {
      const path = await initConfig({ withSecrets: opts['withSecrets'] });
      console.log(`\n  Config file created at: ${path}`);
      console.log('  Edit it with your Azure AI Foundry endpoint and API key.\n');
    } catch (err) {
      console.error(`Error: ${formatError(err)}`);
      process.exit(1);
    }
  });

// ── config show ───────────────────────────────────────────────

configCommand
  .command('show')
  .description('Show current configuration (secrets redacted)')
  .action(async (_opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    try {
      const config = await loadConfig();
      const jsonOutput: boolean = globals['json'] ?? false;

      const redacted = redactObject(config as unknown as Record<string, unknown>);

      if (jsonOutput) {
        console.log(JSON.stringify(redacted, null, 2));
      } else {
        console.log(`\n  Config file: ${getConfigPath()}\n`);
        console.log(JSON.stringify(redacted, null, 2));
        console.log('');
      }
    } catch (err) {
      console.error(`Error: ${formatError(err)}`);
      process.exit(1);
    }
  });
