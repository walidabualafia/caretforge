# CaretForge

**BYOM (Bring Your Own Model) coding-agent CLI** with pluggable providers, starting with Azure AI Foundry endpoints.

CaretForge is a production-grade, extensible CLI that lets you plug in your own model credentials and switch between providers. It supports streaming responses, tool-use (file read/write, shell execution), and safe-by-default execution.

> **What it is:** A coding assistant CLI you control — your models, your credentials, your rules.
>
> **What it is not:** A hosted service, a proprietary model wrapper, or a copy of any existing tool.

---

## Quickstart

### Prerequisites

- Node.js **20+**
- [pnpm](https://pnpm.io/) **9+**

### Install & Build

```bash
git clone https://github.com/YOUR_USER/caretforge.git
cd caretforge
pnpm install
pnpm build
```

### Link the CLI globally (optional)

```bash
pnpm link --global
```

### Initialize configuration

```bash
caretforge config init
```

This creates a config file at `~/.config/caretforge/config.json` (macOS/Linux) or `%APPDATA%\caretforge\config.json` (Windows).

### Configure Azure AI Foundry

Edit your config file or use environment variables:

```bash
export CARETFORGE_AZURE_ENDPOINT="https://YOUR-RESOURCE.openai.azure.com"
export CARETFORGE_AZURE_API_KEY="your-api-key-here"
```

Or edit `~/.config/caretforge/config.json`:

```json
{
  "defaultProvider": "azure-foundry",
  "providers": {
    "azureFoundry": {
      "endpoint": "https://YOUR-RESOURCE.openai.azure.com",
      "apiKey": "your-api-key-here",
      "authMode": "apiKey",
      "models": [{ "id": "gpt-4o", "description": "GPT-4o on Azure AI Foundry" }]
    }
  },
  "telemetry": false
}
```

### Validate your setup

```bash
caretforge doctor
```

---

## Usage

### Interactive Chat

```bash
caretforge chat
caretforge chat --model gpt-4o
caretforge chat --no-stream
```

### Non-interactive Run

```bash
caretforge run "Explain what this project does"
caretforge run "Refactor the auth module" --allow-write
echo "Fix the bug in server.ts" | caretforge run
```

### Structured JSON Output

```bash
caretforge run "List all TODO comments" --json
```

### Model Management

```bash
caretforge model list
caretforge model list --json
```

### Configuration

```bash
caretforge config init              # Create starter config
caretforge config init --with-secrets  # Include API key placeholder
caretforge config show              # Show config (secrets redacted)
```

---

## CLI Reference

### Global Flags

| Flag            | Description                 | Default         |
| --------------- | --------------------------- | --------------- |
| `--provider`    | Provider name               | `azure-foundry` |
| `--model`       | Model ID                    | `gpt-4o`        |
| `--stream`      | Enable streaming output     | `true`          |
| `--no-stream`   | Disable streaming           | —               |
| `--json`        | Structured JSON output      | `false`         |
| `--trace`       | Verbose debug logging       | `false`         |
| `--allow-shell` | Enable shell execution tool | `false`         |
| `--allow-write` | Enable file write tool      | `false`         |

### Commands

| Command       | Description                         |
| ------------- | ----------------------------------- |
| `chat`        | Interactive chat with streaming     |
| `run <task>`  | Non-interactive task execution      |
| `model list`  | Show configured models              |
| `config init` | Create configuration file           |
| `config show` | Display config (secrets redacted)   |
| `doctor`      | Validate config and diagnose issues |

---

## Configuration

### Precedence Order

```
CLI flags  >  Environment variables  >  Config file  >  Defaults
```

### Environment Variables

| Variable                      | Maps to                           |
| ----------------------------- | --------------------------------- |
| `CARETFORGE_DEFAULT_PROVIDER` | `defaultProvider`                 |
| `CARETFORGE_AZURE_ENDPOINT`   | `providers.azureFoundry.endpoint` |
| `CARETFORGE_AZURE_API_KEY`    | `providers.azureFoundry.apiKey`   |
| `CARETFORGE_AZURE_AUTH_MODE`  | `providers.azureFoundry.authMode` |

### Config File Location

| Platform      | Path                               |
| ------------- | ---------------------------------- |
| macOS / Linux | `~/.config/caretforge/config.json` |
| Windows       | `%APPDATA%\caretforge\config.json` |

---

## Security Notes

- **API keys are never printed in full.** The `config show` command and all log output use a redaction helper that masks secrets (showing only the first 4 and last 2 characters).
- **`config init` does not write API keys** unless you pass `--with-secrets`.
- **Shell execution is off by default.** You must explicitly pass `--allow-shell` to enable it.
- **File writing is off by default.** You must explicitly pass `--allow-write` to enable it.
- **Never commit your config file** if it contains secrets. The `.gitignore` excludes `.env` files; consider using environment variables for keys instead.

---

## Architecture

```
src/
├── cli/            # Command definitions (commander)
│   ├── index.ts    # Program setup, global flags
│   ├── chat.ts     # Interactive chat command
│   ├── run.ts      # Non-interactive run command
│   ├── model.ts    # Model listing
│   ├── configCmd.ts# Config init/show
│   ├── doctor.ts   # Diagnostic checks
│   └── shared.ts   # Provider resolution helper
├── core/           # Agent loop, prompts, message types
│   ├── agent.ts    # Main agent loop with tool dispatch
│   ├── messages.ts # Message factory helpers
│   └── prompts.ts  # System/user prompt templates
├── providers/      # Provider abstraction
│   ├── provider.ts # Provider interface + shared types
│   └── azureFoundry.ts  # Azure AI Foundry implementation
├── config/         # Configuration management
│   ├── schema.ts   # Zod schemas + types
│   ├── paths.ts    # Platform-aware config paths
│   └── index.ts    # Load/save/init logic, env var merging
├── tools/          # Tool definitions and executors
│   ├── schema.ts   # Tool JSON schemas for function calling
│   ├── readFile.ts # File reading (always enabled)
│   ├── writeFile.ts# File writing (flag-guarded)
│   ├── execShell.ts# Shell execution (flag-guarded)
│   └── index.ts    # Tool dispatcher
└── util/           # Shared utilities
    ├── logger.ts   # Pino logger setup
    ├── errors.ts   # Error classes
    └── redact.ts   # Secret redaction helpers
```

### Key Design Decisions

- **Provider interface:** All providers implement the same `Provider` interface with `listModels()`, `createChatCompletion()`, and `createStreamingChatCompletion()`. Adding a new provider means implementing this interface.
- **Safe by default:** Shell and file-write tools are disabled unless the user explicitly opts in with `--allow-shell` / `--allow-write`.
- **Agent loop:** The agent sends messages to the model; if the model requests tool calls, they're executed and results fed back. This loops until the model produces a text-only response (or hits the iteration limit).
- **Streaming via SSE:** The Azure provider parses Server-Sent Events manually from the response body for real-time token output.
- **Config merging:** Config file values can be overridden by environment variables, which can be overridden by CLI flags.

---

## Adding a New Provider

1. Create `src/providers/myProvider.ts` implementing the `Provider` interface from `src/providers/provider.ts`.

2. Register it in `src/cli/shared.ts` in the `resolveProvider` switch statement:

```typescript
case 'my-provider': {
  const config = /* load from config */;
  return new MyProvider(config);
}
```

3. Add a Zod schema for its config in `src/config/schema.ts` and add the field to `providersSchema`.

4. Document the new provider in this README.

---

## Development

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint
pnpm lint

# Format
pnpm format

# Type-check without emitting
pnpm typecheck
```

### Running locally without building

```bash
npx tsx src/index.ts chat
npx tsx src/index.ts doctor
```

---

## Azure AI Foundry Endpoint Notes

The provider constructs URLs in this format:

```
{endpoint}/openai/deployments/{model}/chat/completions?api-version={apiVersion}
```

- **`endpoint`**: Your Azure OpenAI resource URL (e.g., `https://my-resource.openai.azure.com`)
- **`model`**: The deployment name (passed via `--model` or config)
- **`chatCompletionPath`**: Configurable, defaults to `/chat/completions`
- **`apiVersion`**: Configurable, defaults to `2024-08-01-preview`

If your Azure AI Foundry endpoint uses a different URL structure, override `chatCompletionPath` in your config.

Authentication is via the `api-key` header. Stubs exist for `azureCli` and `managedIdentity` auth modes but are not yet implemented.

---

## License

MIT
