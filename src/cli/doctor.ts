import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { loadConfig, getConfigPath } from '../config/index.js';
import { formatError } from '../util/errors.js';

interface Check {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

export const doctorCommand = new Command('doctor')
  .description('Validate configuration and diagnose issues')
  .action(async () => {
    console.log('\n  CaretForge Doctor\n');

    const checks: Check[] = [];

    // ── Node version ──────────────────────────────────────
    const nodeVersion = process.versions['node'] ?? '';
    const major = parseInt(nodeVersion.split('.')[0] ?? '0', 10);
    checks.push({
      name: 'Node.js version',
      status: major >= 20 ? 'ok' : 'fail',
      message: `v${nodeVersion}${major < 20 ? ' (requires >= 20)' : ''}`,
    });

    // ── Config file ───────────────────────────────────────
    const configPath = getConfigPath();
    const configExists = existsSync(configPath);
    checks.push({
      name: 'Config file',
      status: configExists ? 'ok' : 'warn',
      message: configExists
        ? configPath
        : `Not found at ${configPath}. Run "caretforge config init" to create one.`,
    });

    // ── Config validation ─────────────────────────────────
    if (configExists) {
      try {
        const config = await loadConfig();
        checks.push({
          name: 'Config valid',
          status: 'ok',
          message: `Default provider: ${config.defaultProvider}`,
        });

        // ── Azure Foundry checks ──────────────────────────
        const azure = config.providers.azureFoundry;
        if (azure) {
          checks.push({
            name: 'Azure endpoint',
            status: azure.endpoint.includes('YOUR-RESOURCE') ? 'warn' : 'ok',
            message: azure.endpoint.includes('YOUR-RESOURCE')
              ? 'Still using placeholder endpoint. Update your config.'
              : azure.endpoint,
          });

          const hasKey = !!azure.apiKey || !!process.env['CARETFORGE_AZURE_API_KEY'];
          checks.push({
            name: 'Azure API key',
            status: azure.authMode === 'apiKey' && !hasKey ? 'warn' : 'ok',
            message:
              azure.authMode === 'apiKey' && !hasKey
                ? 'No API key found. Set CARETFORGE_AZURE_API_KEY or add to config.'
                : `Auth mode: ${azure.authMode}`,
          });

          checks.push({
            name: 'Azure models',
            status: azure.models.length > 0 ? 'ok' : 'warn',
            message:
              azure.models.length > 0
                ? azure.models.map((m) => m.id).join(', ')
                : 'No models configured.',
          });
        } else {
          checks.push({
            name: 'Azure Foundry',
            status: 'warn',
            message: 'Not configured. Add providers.azureFoundry to config.',
          });
        }
      } catch (err) {
        checks.push({
          name: 'Config valid',
          status: 'fail',
          message: formatError(err),
        });
      }
    }

    // ── Print results ─────────────────────────────────────
    const icons = { ok: '✓', warn: '!', fail: '✗' };
    for (const check of checks) {
      const icon = icons[check.status];
      console.log(`  ${icon}  ${check.name}: ${check.message}`);
    }

    const failures = checks.filter((c) => c.status === 'fail');
    const warnings = checks.filter((c) => c.status === 'warn');

    console.log('');
    if (failures.length > 0) {
      console.log(`  ${failures.length} issue(s) need attention.`);
      process.exit(1);
    } else if (warnings.length > 0) {
      console.log(`  ${warnings.length} warning(s). Everything else looks good.`);
    } else {
      console.log('  All checks passed!');
    }
    console.log('');
  });
