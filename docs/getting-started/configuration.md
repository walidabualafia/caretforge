# Configuration

CaretForge uses a layered configuration system with clear precedence rules.

## Precedence Order

```
CLI flags  >  Environment variables  >  Config file  >  Defaults
```

Higher-priority sources override lower ones. For example, `--model gpt-4o` on the command line overrides whatever is in your config file.

## Config File Location

| Platform      | Path                               |
| ------------- | ---------------------------------- |
| macOS / Linux | `~/.config/caretforge/config.json` |
| Windows       | `%APPDATA%\caretforge\config.json` |

The `XDG_CONFIG_HOME` environment variable is respected on Linux/macOS.

## Creating the Config File

```bash
# Create with placeholder values (no secrets)
caretforge config init

# Create with API key placeholder included
caretforge config init --with-secrets
```

## Config File Structure

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
    }
  },
  "telemetry": false
}
```

### Fields

| Field             | Type      | Default           | Description                                             |
| ----------------- | --------- | ----------------- | ------------------------------------------------------- |
| `defaultProvider` | `string`  | `"azure-foundry"` | Which provider to use when `--provider` isn't specified |
| `providers`       | `object`  | `{}`              | Provider-specific configuration (see below)             |
| `telemetry`       | `boolean` | `false`           | Telemetry opt-in (not implemented; switch only)         |

### Azure Foundry Provider Fields

| Field                | Type     | Default                | Description                                             |
| -------------------- | -------- | ---------------------- | ------------------------------------------------------- |
| `endpoint`           | `string` | —                      | **Required.** Your Azure resource URL                   |
| `apiKey`             | `string` | —                      | API key (omit if using Azure CLI auth)                  |
| `authMode`           | `string` | `"apiKey"`             | Auth method: `apiKey`, `azureCli`, or `managedIdentity` |
| `models`             | `array`  | `[]`                   | List of `{ id, description? }` objects                  |
| `chatCompletionPath` | `string` | `"/chat/completions"`  | Path appended for chat completions                      |
| `apiVersion`         | `string` | `"2024-08-01-preview"` | Azure API version query parameter                       |

### Azure Anthropic Provider Fields

For Anthropic models (Claude) deployed on Azure AI Foundry.

| Field        | Type     | Default        | Description                                                 |
| ------------ | -------- | -------------- | ----------------------------------------------------------- |
| `endpoint`   | `string` | —              | **Required.** `https://RESOURCE.openai.azure.com/anthropic` |
| `apiKey`     | `string` | —              | **Required.** Azure API key                                 |
| `apiVersion` | `string` | `"2023-06-01"` | Anthropic API version header                                |
| `models`     | `array`  | `[]`           | List of `{ id, description? }` objects                      |

Example:

```json
{
  "defaultProvider": "azure-anthropic",
  "providers": {
    "azureAnthropic": {
      "endpoint": "https://YOUR-RESOURCE.openai.azure.com/anthropic",
      "apiKey": "your-key-here",
      "models": [{ "id": "claude-opus-4-6", "description": "Claude Opus 4-6" }]
    }
  }
}
```

## Environment Variables

Environment variables override config file values:

| Variable                      | Maps to                           |
| ----------------------------- | --------------------------------- |
| `CARETFORGE_DEFAULT_PROVIDER` | `defaultProvider`                 |
| `CARETFORGE_AZURE_ENDPOINT`   | `providers.azureFoundry.endpoint` |
| `CARETFORGE_AZURE_API_KEY`    | `providers.azureFoundry.apiKey`   |
| `CARETFORGE_AZURE_AUTH_MODE`  | `providers.azureFoundry.authMode` |
| `CARETFORGE_AGENT_ENDPOINT`   | `providers.azureAgents.endpoint`  |
| `CARETFORGE_AGENT_ID`         | `providers.azureAgents.agentId`   |
| `CARETFORGE_AGENT_API_KEY`    | `providers.azureAgents.apiKey`    |

## Viewing Your Config

```bash
# Shows config with secrets redacted
caretforge config show

# JSON output for scripting
caretforge config show --json
```

## Tips

- **Don't commit your config file** if it contains API keys. Use environment variables for CI/CD.
- Use `caretforge config init` (without `--with-secrets`) to create a safe template.
- The `config show` command always redacts secrets, showing only the first 4 and last 2 characters.
