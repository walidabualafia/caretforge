# Environment Variables

All environment variables are optional and override their corresponding config file values.

## Provider Configuration

| Variable                      | Config Path       | Description           |
| ----------------------------- | ----------------- | --------------------- |
| `CARETFORGE_DEFAULT_PROVIDER` | `defaultProvider` | Default provider name |

## Azure Foundry

| Variable                     | Config Path                       | Description        |
| ---------------------------- | --------------------------------- | ------------------ |
| `CARETFORGE_AZURE_ENDPOINT`  | `providers.azureFoundry.endpoint` | Azure resource URL |
| `CARETFORGE_AZURE_API_KEY`   | `providers.azureFoundry.apiKey`   | API key            |
| `CARETFORGE_AZURE_AUTH_MODE` | `providers.azureFoundry.authMode` | Auth mode          |

## Azure Agents

| Variable                    | Config Path                      | Description            |
| --------------------------- | -------------------------------- | ---------------------- |
| `CARETFORGE_AGENT_ENDPOINT` | `providers.azureAgents.endpoint` | Agent project endpoint |
| `CARETFORGE_AGENT_ID`       | `providers.azureAgents.agentId`  | Agent ID               |
| `CARETFORGE_AGENT_API_KEY`  | `providers.azureAgents.apiKey`   | API key (optional)     |

## Other

| Variable          | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `LOG_LEVEL`       | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `XDG_CONFIG_HOME` | Override default config directory on Linux/macOS           |

## Example: CI/CD Setup

```bash
# In your CI pipeline
export CARETFORGE_AZURE_ENDPOINT="https://my-resource.services.ai.azure.com"
export CARETFORGE_AZURE_API_KEY="${{ secrets.AZURE_API_KEY }}"

caretforge run "Review this PR" --json --model gpt-4.1
```

## Example: Multiple Environments

```bash
# Development
export CARETFORGE_AZURE_ENDPOINT="https://dev-resource.services.ai.azure.com"

# Production
export CARETFORGE_AZURE_ENDPOINT="https://prod-resource.services.ai.azure.com"
```

## Precedence

Remember the override order:

```
CLI flags  >  Environment variables  >  Config file  >  Defaults
```

An environment variable always wins over the config file, but a CLI flag always wins over everything.
