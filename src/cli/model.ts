import { Command } from 'commander';
import { resolveProvider } from './shared.js';

export const modelCommand = new Command('model').description('Manage models');

modelCommand
  .command('list')
  .description('List configured models for the active provider')
  .action(async (_opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const provider = await resolveProvider(globals);

    console.log(`\nProvider: ${provider.name}\n`);

    const models = await provider.listModels();

    if (models.length === 0) {
      console.log('  No models configured. Add models to your config file.');
      return;
    }

    const jsonOutput: boolean = globals['json'] ?? false;

    if (jsonOutput) {
      console.log(JSON.stringify(models, null, 2));
    } else {
      for (const m of models) {
        const desc = m.description ? ` — ${m.description}` : '';
        console.log(`  • ${m.id}${desc}`);
      }
    }

    console.log('');
  });
