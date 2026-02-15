# Quick Start

This guide gets you from zero to chatting with your model in under 5 minutes.

## 1. Install & Build

```bash
git clone https://github.com/walidabualafia/caretforge.git
cd caretforge
pnpm install
pnpm build
pnpm link --global
```

## 2. Initialize Configuration

```bash
caretforge config init
```

This creates a config file at:

- **macOS / Linux:** `~/.config/caretforge/config.json`
- **Windows:** `%APPDATA%\caretforge\config.json`

## 3. Set Your Credentials

Edit the config file with your provider details. For example, with **Azure Anthropic (Claude)**:

```json
{
  "defaultProvider": "azure-anthropic",
  "providers": {
    "azureAnthropic": {
      "endpoint": "https://YOUR-RESOURCE.openai.azure.com/anthropic",
      "apiKey": "your-api-key-here",
      "models": [{ "id": "claude-opus-4-6" }]
    }
  }
}
```

Or with **Azure OpenAI**:

```json
{
  "defaultProvider": "azure-foundry",
  "providers": {
    "azureFoundry": {
      "endpoint": "https://YOUR-RESOURCE.openai.azure.com",
      "apiKey": "your-api-key-here",
      "models": [{ "id": "gpt-4.1" }]
    }
  }
}
```

Or with **Azure OpenAI Responses API** (for Codex models):

```json
{
  "defaultProvider": "azure-responses",
  "providers": {
    "azureResponses": {
      "endpoint": "https://YOUR-RESOURCE.openai.azure.com",
      "apiKey": "your-api-key-here",
      "models": [{ "id": "gpt-5.2-codex" }]
    }
  }
}
```

You can also use environment variables — see [Configuration](/getting-started/configuration) for details.

## 4. Check Your Setup

```bash
caretforge doctor
```

You should see all green checkmarks:

```
  CaretForge Doctor

  ✓  Node.js version: v20.x.x
  ✓  Config file: ~/.config/caretforge/config.json
  ✓  Config valid: Default provider: azure-anthropic
```

## 5. Start Chatting

Just run `caretforge`:

```
$ caretforge

  CaretForge v0.1.0
  azure-anthropic · claude-opus-4-6
  Type /help for commands · Ctrl+C to exit

> What does this project do?

This is a BYOM coding-agent CLI that lets you...

> Read the package.json and tell me the version

  ▶ Read package.json
    42 lines

The project version is 0.1.0.

> /exit
  Goodbye!
```

## 6. Run a One-Shot Task

```bash
caretforge "Explain what this project does"
```

Or pipe input:

```bash
echo "Summarize this error: ECONNREFUSED" | caretforge run
```

## 7. Permissions

When the agent needs to write a file or run a command, you'll be prompted:

```
  ⚡ Write to src/utils.ts
  Allow? [y]es / [n]o / [a]lways
```

Choose **a** to allow all future writes for the session. Or use flags to skip prompts:

```bash
caretforge --allow-write                # auto-approve writes
caretforge --allow-shell                # auto-approve shell
caretforge --allow-write --allow-shell  # full autonomy
```

::: warning
Be careful with `--allow-shell`. The agent can execute arbitrary commands. Only enable it in trusted environments.
:::

## What's Next?

- [Configuration](/getting-started/configuration) — Full config file reference
- [Azure AI Foundry Setup](/guide/azure-setup) — Detailed Azure setup guide
- [CLI Reference](/reference/cli) — All commands and flags
