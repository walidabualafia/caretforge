import { loadConfig } from '../config/index.js';
import { AzureFoundryProvider } from '../providers/azureFoundry.js';
import { AzureAgentsProvider } from '../providers/azureAgents.js';
import { AzureAnthropicProvider } from '../providers/azureAnthropic.js';
import { AzureResponsesProvider } from '../providers/azureResponses.js';
import type { Provider, ModelInfo } from '../providers/provider.js';
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

    case 'azure-responses': {
      const responsesConfig = config.providers.azureResponses;
      if (!responsesConfig) {
        throw new ConfigError(
          'Azure Responses provider is not configured. Add providers.azureResponses to config.',
        );
      }
      return new AzureResponsesProvider(responsesConfig);
    }

    default:
      throw new ConfigError(
        `Unknown provider "${providerName}". Available providers: azure-foundry, azure-agents, azure-anthropic, azure-responses`,
      );
  }
}

/** A provider instance paired with its models. */
export interface ProviderEntry {
  name: string;
  provider: Provider;
  models: ModelInfo[];
}

/**
 * Instantiate every configured provider and collect their models.
 * Providers that fail to initialise or list models are silently skipped.
 */
export async function resolveAllProviders(): Promise<ProviderEntry[]> {
  const config = await loadConfig();
  const entries: ProviderEntry[] = [];

  // Map config keys → provider name + factory
  const factories: Array<{
    key: keyof typeof config.providers;
    name: string;
    create: () => Provider;
  }> = [];

  if (config.providers.azureAnthropic) {
    const cfg = config.providers.azureAnthropic;
    factories.push({
      key: 'azureAnthropic',
      name: 'azure-anthropic',
      create: () => new AzureAnthropicProvider(cfg),
    });
  }

  if (config.providers.azureFoundry) {
    const cfg = config.providers.azureFoundry;
    factories.push({
      key: 'azureFoundry',
      name: 'azure-foundry',
      create: () => new AzureFoundryProvider(cfg),
    });
  }

  if (config.providers.azureAgents) {
    const cfg = config.providers.azureAgents;
    factories.push({
      key: 'azureAgents',
      name: 'azure-agents',
      create: () => new AzureAgentsProvider(cfg),
    });
  }

  if (config.providers.azureResponses) {
    const cfg = config.providers.azureResponses;
    factories.push({
      key: 'azureResponses',
      name: 'azure-responses',
      create: () => new AzureResponsesProvider(cfg),
    });
  }

  for (const f of factories) {
    try {
      const provider = f.create();
      const models = await provider.listModels();
      entries.push({ name: f.name, provider, models });
    } catch {
      // Provider misconfigured or listModels failed — skip silently
    }
  }

  return entries;
}
