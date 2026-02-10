import { loadConfig } from '../config/index.js';
import { AzureFoundryProvider } from '../providers/azureFoundry.js';
import { AzureAgentsProvider } from '../providers/azureAgents.js';
import { AzureAnthropicProvider } from '../providers/azureAnthropic.js';
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

    case 'azure-agents': {
      const agentsConfig = config.providers.azureAgents;
      if (!agentsConfig) {
        throw new ConfigError(
          'Azure Agents provider is not configured. Set CARETFORGE_AGENT_ENDPOINT and CARETFORGE_AGENT_ID env vars, or add providers.azureAgents to config.',
        );
      }
      return new AzureAgentsProvider(agentsConfig);
    }

    case 'azure-anthropic': {
      const anthropicConfig = config.providers.azureAnthropic;
      if (!anthropicConfig) {
        throw new ConfigError(
          'Azure Anthropic provider is not configured. Add providers.azureAnthropic to config.',
        );
      }
      return new AzureAnthropicProvider(anthropicConfig);
    }

    default:
      throw new ConfigError(
        `Unknown provider "${providerName}". Available providers: azure-foundry, azure-agents, azure-anthropic`,
      );
  }
}
