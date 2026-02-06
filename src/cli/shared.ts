import { loadConfig } from '../config/index.js';
import { AzureFoundryProvider } from '../providers/azureFoundry.js';
import type { Provider } from '../providers/provider.js';
import { ConfigError } from '../util/errors.js';

/**
 * Resolve the active provider from CLI globals + config.
 */
export async function resolveProvider(globals: Record<string, unknown>): Promise<Provider> {
  const config = await loadConfig();

  const providerName = (globals['provider'] as string | undefined) ?? config.defaultProvider;

  switch (providerName) {
    case 'azure-foundry': {
      const azureConfig = config.providers.azureFoundry;
      if (!azureConfig) {
        throw new ConfigError(
          'Azure Foundry provider is not configured. Run "caretforge config init" or set env vars.',
        );
      }
      return new AzureFoundryProvider(azureConfig);
    }

    default:
      throw new ConfigError(
        `Unknown provider "${providerName}". Available providers: azure-foundry`,
      );
  }
}
