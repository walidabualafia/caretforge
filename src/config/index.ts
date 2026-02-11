import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfigPath } from './paths.js';
import { configSchema, type CaretForgeConfig } from './schema.js';
import { ConfigError } from '../util/errors.js';
import { getLogger } from '../util/logger.js';

export { getConfigDir, getConfigPath } from './paths.js';
export {
  configSchema,
  type CaretForgeConfig,
  type AzureFoundryConfig,
  type AzureAgentsConfig,
} from './schema.js';

// ── Merge helper ──────────────────────────────────────────────

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) ?? {},
        value as Record<string, unknown>,
      );
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ── Environment variable overrides ────────────────────────────

function getEnvOverrides(): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  if (process.env['CARETFORGE_DEFAULT_PROVIDER']) {
    overrides['defaultProvider'] = process.env['CARETFORGE_DEFAULT_PROVIDER'];
  }

  const azureEndpoint = process.env['CARETFORGE_AZURE_ENDPOINT'];
  const azureApiKey = process.env['CARETFORGE_AZURE_API_KEY'];
  const azureAuthMode = process.env['CARETFORGE_AZURE_AUTH_MODE'];

  if (azureEndpoint || azureApiKey || azureAuthMode) {
    overrides['providers'] = {
      ...((overrides['providers'] as Record<string, unknown>) ?? {}),
      azureFoundry: {
        ...(azureEndpoint ? { endpoint: azureEndpoint } : {}),
        ...(azureApiKey ? { apiKey: azureApiKey } : {}),
        ...(azureAuthMode ? { authMode: azureAuthMode } : {}),
      },
    };
  }

  // Azure Agents env vars
  const agentEndpoint = process.env['CARETFORGE_AGENT_ENDPOINT'];
  const agentId = process.env['CARETFORGE_AGENT_ID'];
  const agentApiKey = process.env['CARETFORGE_AGENT_API_KEY'];

  if (agentEndpoint || agentId) {
    overrides['providers'] = {
      ...((overrides['providers'] as Record<string, unknown>) ?? {}),
      azureAgents: {
        ...(agentEndpoint ? { endpoint: agentEndpoint } : {}),
        ...(agentId ? { agentId } : {}),
        ...(agentApiKey ? { apiKey: agentApiKey } : {}),
      },
    };
  }

  // AWS Bedrock env vars
  const awsRegion = process.env['CARETFORGE_AWS_REGION'] || process.env['AWS_REGION'];
  const awsAgentArn = process.env['CARETFORGE_AWS_AGENT_ARN'];

  if (awsRegion || awsAgentArn) {
    overrides['providers'] = {
      ...((overrides['providers'] as Record<string, unknown>) ?? {}),
      awsBedrockAgentCore: {
        ...(awsRegion ? { region: awsRegion } : {}),
        ...(awsAgentArn ? { agentRuntimeArn: awsAgentArn } : {}),
      },
    };
  }

  return overrides;
}

// ── Load config ───────────────────────────────────────────────

/**
 * Load configuration with precedence: env vars > config file > defaults.
 * CLI flag overrides are applied by the caller after this returns.
 */
export async function loadConfig(): Promise<CaretForgeConfig> {
  const log = getLogger();
  const configPath = getConfigPath();

  let fileConfig: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      const raw = await readFile(configPath, 'utf-8');
      fileConfig = JSON.parse(raw) as Record<string, unknown>;
      log.debug({ configPath }, 'Loaded config from file');
    } catch (err) {
      throw new ConfigError(
        `Failed to parse config at ${configPath}: ${(err as Error).message}`,
        err as Error,
      );
    }
  } else {
    log.debug('No config file found; using defaults + env');
  }

  const envOverrides = getEnvOverrides();
  const merged = deepMerge(fileConfig, envOverrides);

  const result = configSchema.safeParse(merged);
  if (!result.success) {
    throw new ConfigError(`Invalid configuration:\n${result.error.format()._errors.join('\n')}`);
  }

  return result.data;
}

// ── Save config ───────────────────────────────────────────────

export async function saveConfig(
  config: CaretForgeConfig,
  options?: { withSecrets?: boolean },
): Promise<void> {
  const configPath = getConfigPath();
  await mkdir(dirname(configPath), { recursive: true });

  // Strip secrets unless explicitly told to keep them
  const toSave: CaretForgeConfig = !options?.withSecrets
    ? {
      ...config,
      providers: {
        ...config.providers,
        azureFoundry: config.providers.azureFoundry
          ? {
            ...config.providers.azureFoundry,
            apiKey: undefined,
          }
          : undefined,
      },
    }
    : config;

  await writeFile(configPath, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
}

// ── Init config ───────────────────────────────────────────────

/**
 * Create a starter config file with helpful defaults.
 * Returns the path written to.
 */
export async function initConfig(options?: { withSecrets?: boolean }): Promise<string> {
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    throw new ConfigError(
      `Config file already exists at ${configPath}. Remove it first or edit it directly.`,
    );
  }

  const template: CaretForgeConfig = {
    defaultProvider: 'azure-foundry',
    providers: {
      azureFoundry: {
        endpoint: 'https://YOUR-RESOURCE.openai.azure.com',
        apiKey: options?.withSecrets ? 'YOUR-API-KEY-HERE' : undefined,
        authMode: 'apiKey',
        models: [{ id: 'gpt-4o', description: 'GPT-4o on Azure AI Foundry' }],
        chatCompletionPath: '/chat/completions',
        apiVersion: '2024-08-01-preview',
      },
    },
    telemetry: false,
  };

  await saveConfig(template, { withSecrets: options?.withSecrets });
  return configPath;
}
