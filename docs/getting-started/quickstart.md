# Quick Start

This guide gets you from zero to chatting with your model in under 5 minutes.

## 1. Initialize Configuration

```bash
caretforge config init
```

This creates a config file at:

- **macOS / Linux:** `~/.config/caretforge/config.json`
- **Windows:** `%APPDATA%\caretforge\config.json`

## 2. Set Your Azure Credentials

The fastest way is with environment variables:

```bash
export CARETFORGE_AZURE_ENDPOINT="https://YOUR-RESOURCE.services.ai.azure.com"
export CARETFORGE_AZURE_API_KEY="your-api-key-here"
```

Or edit the config file directly — see [Configuration](/getting-started/configuration) for details.

## 3. Check Your Setup

```bash
caretforge doctor
```

You should see all green checkmarks:

```
  CaretForge Doctor

  ✓  Node.js version: v20.x.x
  ✓  Config file: ~/.config/caretforge/config.json
  ✓  Config valid: Default provider: azure-foundry
  ✓  Azure endpoint: https://your-resource.services.ai.azure.com
  ✓  Azure API key: Auth mode: apiKey
  ✓  Azure models: gpt-4o

  All checks passed!
```

## 4. Start Chatting

```bash
caretforge chat --model gpt-4o
```

```
  CaretForge chat  |  provider: azure-foundry  |  model: gpt-4o
  Type "exit" or Ctrl+C to quit.

you > What is the capital of France?

assistant > The capital of France is Paris.

you > exit

Goodbye!
```

## 5. Run a One-Shot Task

```bash
caretforge run "Explain what a Makefile does in 2 sentences" --model gpt-4o
```

Or pipe input:

```bash
echo "Summarize this error: ECONNREFUSED" | caretforge run --model gpt-4o
```

## 6. Enable Tools

By default, the agent can only **read files**. To enable more capabilities:

```bash
# Allow the agent to write files
caretforge chat --allow-write

# Allow the agent to run shell commands
caretforge chat --allow-shell

# Allow both
caretforge chat --allow-write --allow-shell
```

::: warning
Be careful with `--allow-shell`. The agent can execute arbitrary commands. Only enable it in trusted environments.
:::

## What's Next?

- [Configuration](/getting-started/configuration) — Full config file reference
- [Azure AI Foundry Setup](/guide/azure-setup) — Detailed Azure setup guide
- [CLI Reference](/reference/cli) — All commands and flags
