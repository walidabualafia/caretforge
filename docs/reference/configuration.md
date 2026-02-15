# Configuration File Reference

Complete reference for the `config.json` file.

## Full Schema

```json
{
  "defaultProvider": "azure-foundry",
  "providers": {
    "azureFoundry": {
      "endpoint": "https://YOUR-RESOURCE.services.ai.azure.com",
      "apiKey": "your-api-key",
      "authMode": "apiKey",
      "models": [{ "id": "gpt-4o", "description": "GPT-4o" }],
      "chatCompletionPath": "/chat/completions",
      "apiVersion": "2024-10-21"
    },
    "azureAgents": {
      "endpoint": "https://RESOURCE.services.ai.azure.com/api/projects/PROJECT",
      "agentId": "my-agent-id",
      "apiKey": "optional-api-key",
      "apiVersion": "2025-05-15-preview"
    },
    "azureAnthropic": {
      "endpoint": "https://RESOURCE.openai.azure.com/anthropic",
      "apiKey": "your-api-key",
      "models": [{ "id": "claude-opus-4-6", "description": "Claude Opus 4-6" }]
    },
    "awsBedrockAgentCore": {
      "region": "us-east-1",
      "agentRuntimeArn": "arn:aws:bedrock:us-east-1:123456789012:agent-alias/AGENT_ID/ALIAS_ID",
      "profile": "default"
    }
  },
  "telemetry": false
}
```

## Root Fields

### `defaultProvider`

- **Type:** `string`
- **Default:** `"azure-foundry"`
- **Values:** `"azure-foundry"`, `"azure-agents"`, `"azure-anthropic"`, `"aws-bedrock-agent-core"`

The provider used when `--provider` is not specified on the command line.

### `telemetry`

- **Type:** `boolean`
- **Default:** `false`

Telemetry opt-in switch. No telemetry is currently implemented — this is a placeholder for future use.

## Azure Foundry Provider

Path: `providers.azureFoundry`

For standard Azure OpenAI chat completions API.

| Field                | Type           | Required | Default                | Description                                   |
| -------------------- | -------------- | -------- | ---------------------- | --------------------------------------------- |
| `endpoint`           | `string (URL)` | Yes      | —                      | Azure resource URL                            |
| `apiKey`             | `string`       | No       | —                      | API key for authentication                    |
| `authMode`           | `enum`         | No       | `"apiKey"`             | `"apiKey"`, `"azureCli"`, `"managedIdentity"` |
| `models`             | `array`        | No       | `[]`                   | Available models                              |
| `chatCompletionPath` | `string`       | No       | `"/chat/completions"`  | API path suffix                               |
| `apiVersion`         | `string`       | No       | `"2024-08-01-preview"` | API version parameter                         |

### URL Construction

```
{endpoint}/openai/deployments/{model}{chatCompletionPath}?api-version={apiVersion}
```

## Azure Agents Provider

Path: `providers.azureAgents`

For Azure AI Foundry Agent Service (threads/runs API).

| Field        | Type           | Required | Default                | Description                      |
| ------------ | -------------- | -------- | ---------------------- | -------------------------------- |
| `endpoint`   | `string (URL)` | Yes      | —                      | AI Foundry project endpoint      |
| `agentId`    | `string`       | Yes      | —                      | Agent/assistant ID               |
| `apiKey`     | `string`       | No       | —                      | API key (or uses Azure CLI auth) |
| `apiVersion` | `string`       | No       | `"2025-05-15-preview"` | API version parameter            |

## Azure Anthropic Provider

Path: `providers.azureAnthropic`

For Anthropic models (Claude) deployed on Azure AI Foundry. Uses the Anthropic Messages API through Azure's `/anthropic` gateway.

| Field        | Type           | Required | Default        | Description                                   |
| ------------ | -------------- | -------- | -------------- | --------------------------------------------- |
| `endpoint`   | `string (URL)` | Yes      | —              | `https://RESOURCE.openai.azure.com/anthropic` |
| `apiKey`     | `string`       | Yes      | —              | Azure API key                                 |
| `apiVersion` | `string`       | No       | `"2023-06-01"` | Anthropic API version header                  |
| `models`     | `array`        | No       | `[]`           | Available models                              |

### URL Construction

```
{endpoint}/v1/messages
```

Uses the `x-api-key` header for authentication and `anthropic-version` header for API versioning.

## AWS Bedrock Agent Core Provider

Path: `providers.awsBedrockAgentCore`

For Amazon Bedrock Agents (InvokeAgent API).

| Field             | Type     | Required | Default | Description                                   |
| ----------------- | -------- | -------- | ------- | --------------------------------------------- |
| `region`          | `string` | Yes      | —       | AWS region (e.g. `us-east-1`)                 |
| `agentRuntimeArn` | `string` | Yes      | —       | Full ARN of the Agent Alias                   |
| `accessKeyId`     | `string` | No       | —       | Static AWS Access Key                         |
| `secretAccessKey` | `string` | No       | —       | Static AWS Secret Key                         |
| `sessionToken`    | `string` | No       | —       | AWS Session Token                             |
| `profile`         | `string` | No       | —       | AWS profile name to use from credentials file |

### Credentials Resolution

CaretForge follows the standard AWS credential provider chain order:

1. Static credentials in `config.json`
2. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
3. AWS profile specified in `config.json`
4. Default credential chain (shared config file, IAM roles, etc.)

## Validation

The config file is validated against a [Zod](https://zod.dev) schema at load time. Invalid values produce clear error messages:

```bash
caretforge doctor
# ✗  Config valid: Invalid configuration: ...
```
