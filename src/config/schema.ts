import { z } from 'zod';

// ── Model entry ───────────────────────────────────────────────
export const modelSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
});

// ── Azure AI Foundry provider config ──────────────────────────
export const azureFoundryConfigSchema = z.object({
  endpoint: z.string().url('Must be a valid URL, e.g. https://my-endpoint.openai.azure.com'),
  apiKey: z.string().optional(),
  authMode: z.enum(['apiKey', 'azureCli', 'managedIdentity']).default('apiKey'),
  models: z.array(modelSchema).default([]),
  /** Path appended to the endpoint for chat completions. */
  chatCompletionPath: z.string().default('/chat/completions'),
  /** Azure API version query parameter. */
  apiVersion: z.string().default('2024-08-01-preview'),
});

// ── Azure AI Agents provider config ───────────────────────────
export const azureAgentsConfigSchema = z.object({
  endpoint: z.string().url('Must be a valid URL, e.g. https://RESOURCE.services.ai.azure.com/api/projects/PROJECT'),
  agentId: z.string().min(1, 'Agent ID is required'),
  apiKey: z.string().optional(),
  /** API version query parameter. */
  apiVersion: z.string().default('2025-05-15-preview'),
});

// ── Top-level providers map ───────────────────────────────────
export const providersSchema = z.object({
  azureFoundry: azureFoundryConfigSchema.optional(),
  azureAgents: azureAgentsConfigSchema.optional(),
});

// ── Root config ───────────────────────────────────────────────
export const configSchema = z.object({
  defaultProvider: z.string().default('azure-foundry'),
  providers: providersSchema.default({}),
  telemetry: z.boolean().default(false),
});

// ── Exported types ────────────────────────────────────────────
export type CaretForgeConfig = z.infer<typeof configSchema>;
export type AzureFoundryConfig = z.infer<typeof azureFoundryConfigSchema>;
export type AzureAgentsConfig = z.infer<typeof azureAgentsConfigSchema>;
export type ModelConfig = z.infer<typeof modelSchema>;
export type ProvidersConfig = z.infer<typeof providersSchema>;
