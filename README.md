<p align="center">
  <img src="assets/logo.png" alt="CaretForge Logo" width="200">
</p>

<h1 align="center">CaretForge</h1>

<p align="center">
  <strong>An agentic coding tool that lives in your terminal.</strong><br>
  Bring your own model, plug in your credentials, and let it read, write, and execute.
</p>

<p align="center">
  <a href="https://github.com/walidabualafia/caretforge/actions"><img src="https://github.com/walidabualafia/caretforge/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/walidabualafia/caretforge/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node">
</p>

<p align="center">
  <a href="https://walidabualafia.github.io/caretforge/">Documentation</a> ·
  <a href="https://walidabualafia.github.io/caretforge/getting-started/quickstart.html">Quick Start</a> ·
  <a href="https://walidabualafia.github.io/caretforge/reference/cli.html">CLI Reference</a>
</p>

---

## What is CaretForge?

CaretForge is a BYOM (Bring Your Own Model) coding agent CLI — similar in spirit to [Claude Code](https://github.com/anthropics/claude-code), but open-source and provider-agnostic. You bring your own model credentials, and CaretForge gives you an agentic coding assistant in your terminal that can:

- **Read files** in your codebase
- **Write and create files** (with permission)
- **Execute shell commands** (with permission)
- **Stream responses** in real-time
- **Use any model** via pluggable providers (Azure OpenAI, Azure Anthropic, and more)

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
git clone https://github.com/walidabualafia/caretforge.git
cd caretforge
pnpm install
pnpm build
pnpm link --global   # makes 'caretforge' available everywhere
```

### Configure

```bash
caretforge config init
```

Edit `~/.config/caretforge/config.json` with your provider credentials. For example, with Azure Anthropic (Claude):

```json
{
  "defaultProvider": "azure-anthropic",
  "providers": {
    "azureAnthropic": {
      "endpoint": "https://YOUR-RESOURCE.openai.azure.com/anthropic",
      "apiKey": "your-api-key",
      "models": [{ "id": "claude-opus-4-6" }]
    }
  }
}
```

### Validate

```bash
caretforge doctor
```

### Go

```bash
caretforge                          # interactive chat
caretforge "explain this project"   # one-shot task
```

---

## Usage

CaretForge works just like Claude Code — run it with no arguments for interactive mode, or pass a task directly:

### Interactive Chat

```bash
caretforge                              # start chatting
caretforge --model gpt-4.1             # use a specific model
caretforge --provider azure-foundry    # use a specific provider
```

Inside the REPL, you have slash commands:

| Command       | Description                      |
| ------------- | -------------------------------- |
| `/help`       | Show available commands          |
| `/model`      | List models from all providers   |
| `/model <id>` | Switch model mid-conversation    |
| `/clear`      | Clear conversation history       |
| `/compact`    | Trim older messages from history |
| `/exit`       | Exit CaretForge                  |
| `/quit`       | Exit CaretForge (alias)          |

You can also type `exit`, `quit`, or `q` without the slash to leave the REPL.

### File Context with @

Reference files directly in your prompts using the `@` prefix:

```
> Explain @src/core/agent.ts
> Compare @package.json and @tsconfig.json
```

Tab-completion is supported — press Tab after `@` to see available files. Files in your working directory are indexed on startup with a comprehensive governance model: `.gitignore` rules are respected (via `git ls-files`), binary files are detected and skipped, symlinks are followed safely, files over 1 MB are excluded, and a 10-second timeout prevents stalls. You can add a `.caretforgeignore` file for custom exclusions. File sizes are shown during interactive browsing.

### One-Shot Tasks

```bash
caretforge "Refactor the auth module"
caretforge "List all TODO comments" --json
echo "Fix the bug in server.ts" | caretforge run
```

### Permissions

When the agent wants to write a file or run a shell command, **you'll be prompted**:

```
  ⚡ Write to src/utils.ts
  Allow? [y]es / [n]o / [a]lways
```

- **y** — allow this one time
- **n** — deny (the agent will adapt)
- **a** — allow all future calls of this type for the session

To skip prompts entirely, use the auto-approve flags:

```bash
caretforge --allow-write              # auto-approve file writes
caretforge --allow-shell              # auto-approve shell execution
caretforge --allow-write --allow-shell  # full autonomy
```

### Structured JSON Output

```bash
caretforge run "List all TODO comments" --json
```

---

## Providers

CaretForge supports multiple providers through a pluggable interface:

| Provider                 | Models                     | Status    |
| ------------------------ | -------------------------- | --------- |
| `azure-anthropic`        | Claude Opus, Sonnet, etc.  | **Ready** |
| `azure-foundry`          | GPT-4o, GPT-4.1, Kimi K2.5 | **Ready** |
| `aws-bedrock-agent-core` | Amazon Bedrock Agents      | **Ready** |
| `azure-responses`        | gpt-5.2-codex, codex-mini  | **Ready** |
| `azure-agents`           | Azure AI Agent Service     | Preview   |

### Adding a New Provider

1. Create `src/providers/myProvider.ts` implementing the `Provider` interface
2. Register it in `src/cli/shared.ts`
3. Add a Zod config schema in `src/config/schema.ts`
4. Document it

---

## CLI Reference

### Global Flags

| Flag            | Description                  | Default     |
| --------------- | ---------------------------- | ----------- |
| `--provider`    | Provider name                | from config |
| `--model`       | Model ID                     | from config |
| `--stream`      | Enable streaming output      | `true`      |
| `--no-stream`   | Disable streaming            | —           |
| `--json`        | Structured JSON output       | `false`     |
| `--trace`       | Verbose debug logging        | `false`     |
| `--allow-shell` | Auto-approve shell execution | `false`     |
| `--allow-write` | Auto-approve file writes     | `false`     |

### Commands

| Command       | Description                         |
| ------------- | ----------------------------------- |
| _(none)_      | Interactive chat (default)          |
| `"task"`      | One-shot task execution             |
| `chat`        | Interactive chat (explicit)         |
| `run <task>`  | One-shot task execution (explicit)  |
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

## Security

- **Session disclaimer.** Every time you start CaretForge, a disclaimer is displayed and you must accept before proceeding. Acceptance is never cached to disk.
- **Permission prompts by default.** Write and shell tools require explicit user approval per action (or `--allow-write` / `--allow-shell` to auto-approve).
- **Command safety analysis.** Shell commands are classified into risk tiers (safe, mutating, destructive, blocked). Destructive commands always prompt — even with `--allow-shell`. Blocked commands (e.g., `rm -rf /`, fork bombs) are denied outright.
- **File indexing governance.** The `@` file context system respects `.gitignore`, detects binary files, enforces size limits, handles symlinks safely, and supports `.caretforgeignore` for custom exclusions.
- **Secrets are never printed in full.** The `config show` command and logs use redaction (first 4, last 2 characters).
- **`config init` does not write API keys** unless you pass `--with-secrets`.
- **Never commit your config file** with secrets. Use environment variables in CI/CD.

---

## Architecture

```
src/
├── cli/            # Command definitions (Commander.js)
│   ├── index.ts    # Program setup, global flags
│   ├── chat.ts     # Interactive chat REPL
│   ├── run.ts      # One-shot task execution
│   ├── model.ts    # Model listing
│   ├── configCmd.ts# Config init/show
│   ├── doctor.ts   # Diagnostic checks
│   └── shared.ts   # Provider resolution
├── core/           # Agent loop and prompts
│   ├── agent.ts    # Agent loop with tool dispatch + permissions
│   ├── messages.ts # Message factory helpers
│   └── prompts.ts  # System/user prompt templates
├── providers/      # Provider abstraction
│   ├── provider.ts # Provider interface + shared types
│   ├── azureAnthropic.ts  # Azure Anthropic (Claude) provider
│   ├── azureFoundry.ts    # Azure OpenAI provider
│   ├── azureResponses.ts  # Azure OpenAI Responses API provider
│   └── azureAgents.ts     # Azure AI Agent Service provider
├── config/         # Configuration management
│   ├── schema.ts   # Zod schemas + types
│   ├── paths.ts    # Platform-aware config paths
│   └── index.ts    # Load/save/init, env var merging
├── tools/          # Tool definitions and executors
│   ├── schema.ts   # Tool JSON schemas for function calling
│   ├── readFile.ts # File reading
│   ├── writeFile.ts# File writing
│   ├── execShell.ts# Shell execution
│   └── index.ts    # Tool dispatcher
├── safety/         # Command & path safety analysis
│   └── commandSafety.ts # Risk-tier classification
├── ui/             # Terminal UI
│   ├── format.ts   # Colors, tool display, banners
│   ├── permissions.ts # Interactive permission prompts
│   ├── disclaimer.ts  # Session acceptance prompt
│   └── fileContext.ts # @file indexing, completion, expansion
└── util/           # Shared utilities
    ├── logger.ts   # Pino logger
    ├── errors.ts   # Error classes
    └── redact.ts   # Secret redaction
```

### Key Design Decisions

- **Claude Code-style UX:** `caretforge` alone starts interactive mode; `caretforge "task"` runs a one-shot task. Permission prompts appear inline. `@file` references expand into file content context.
- **Provider interface:** All providers implement `listModels()`, `createChatCompletion()`, and `createStreamingChatCompletion()`.
- **Permission model:** The model always knows about all tools. Permission is checked at execution time, not tool selection time. Users approve per-action or use flags to auto-approve.
- **Agent loop:** Messages go to the model → tool calls are executed → results are fed back → loop until text response (max 20 iterations).
- **Streaming via SSE:** Providers parse Server-Sent Events for real-time token output.

---

## Development

```bash
pnpm install       # install dependencies
pnpm build         # compile TypeScript
pnpm test          # run tests
pnpm test:watch    # tests in watch mode
pnpm lint          # lint with ESLint
pnpm format        # format with Prettier
pnpm typecheck     # type-check without emitting
```

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, development workflow, and PR guidelines.

---

## License

[MIT](LICENSE)
