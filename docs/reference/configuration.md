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
    }
  },
  "telemetry": false
}
```

## Root Fields

### `defaultProvider`

- **Type:** `string`
- **Default:** `"azure-foundry"`
- **Values:** `"azure-foundry"`, `"azure-agents"`

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

## Validation

The config file is validated against a [Zod](https://zod.dev) schema at load time. Invalid values produce clear error messages:

```bash
caretforge doctor
# ✗  Config valid: Invalid configuration: ...
```
