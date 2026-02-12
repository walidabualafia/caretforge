# Architecture

CaretForge is a single-package TypeScript application organized into clear modules.

## Directory Structure

```
src/
├── index.ts            # Entry point (shebang + commander)
├── cli/                # Command definitions
│   ├── index.ts        # Program setup, global flags
│   ├── chat.ts         # Interactive chat command
│   ├── run.ts          # Non-interactive run command
│   ├── model.ts        # Model listing
│   ├── configCmd.ts    # Config init/show
│   ├── doctor.ts       # Diagnostic checks
│   └── shared.ts       # Provider resolution
├── core/               # Agent loop
│   ├── agent.ts        # Main loop with tool dispatch
│   ├── messages.ts     # Message factory helpers
│   └── prompts.ts      # System/user prompt templates
├── providers/          # Model providers
│   ├── provider.ts     # Provider interface + types
│   ├── azureFoundry.ts # Azure OpenAI chat completions
│   ├── azureAnthropic.ts # Azure Anthropic (Claude) provider
│   ├── azureResponses.ts # Azure OpenAI Responses API (Codex)
│   └── azureAgents.ts  # Azure AI Agent Service (threads/runs)
├── config/             # Configuration
│   ├── schema.ts       # Zod schemas + types
│   ├── paths.ts        # Platform-aware config paths
│   └── index.ts        # Load/save/init, env merging
├── tools/              # Agent tools
│   ├── schema.ts       # Tool JSON schemas
│   ├── readFile.ts     # Read file contents
│   ├── writeFile.ts    # Write file (flag-gated)
│   ├── execShell.ts    # Shell execution (flag-gated)
│   └── index.ts        # Tool dispatcher
├── safety/             # Command & path safety
│   └── commandSafety.ts # Risk-tier classification
└── util/               # Shared utilities
    ├── logger.ts       # Pino logger
    ├── errors.ts       # Error classes
    └── redact.ts       # Secret redaction
```

## Data Flow

```
User Input
    │
    ▼
┌─────────┐     ┌──────────┐     ┌──────────┐
│   CLI   │────▶│  Agent   │────▶│ Provider │──── HTTP ──▶ Azure API
│ Command │     │   Loop   │◀────│          │◀────────────
└─────────┘     └────┬─────┘     └──────────┘
                     │
                     │ tool calls?
                     ▼
                ┌──────────┐     ┌──────────┐
                │ Safety   │────▶│  Tools   │
                │ Analysis │     │ Executor │
                └──────────┘     └──────────┘
```

1. **CLI** parses arguments and resolves the provider
2. **Agent Loop** manages the conversation, sending messages to the provider
3. **Provider** makes HTTP calls to the model API
4. If the model requests **tool calls**, the **Safety Analysis** layer classifies them by risk level
5. Blocked commands are denied outright; destructive commands always prompt; safe commands may auto-approve
6. Approved tools are executed and results are fed back to the model
7. When the model produces a text-only response, the loop ends

## Key Design Decisions

### Provider Interface

All providers implement the same interface (`Provider`). This makes it trivial to add support for OpenAI, Anthropic, local models, or any other API-compatible service.

### Safe by Default

The `--allow-write` and `--allow-shell` flags are **opt-in**. Without them, the agent can only read files. This prevents accidental filesystem or system modifications.

### Config Layering

Configuration merges from three sources with clear precedence:

```
CLI flags  >  Environment variables  >  Config file  >  Defaults
```

This lets you keep a base config file and override specific values per-session or in CI.

### Streaming

Streaming is the default. The provider yields `StreamChunk` objects as tokens arrive via SSE, and the CLI prints them immediately. Non-streaming mode is available with `--no-stream`.

### Error Handling

All errors extend `CaretForgeError` with a `code` field:

- `ProviderError` — API call failures, bad responses
- `ConfigError` — Configuration loading/validation issues
- `ToolError` — Tool execution failures

### Logging

[Pino](https://github.com/pinojs/pino) is used for structured logging. Enable verbose output with `--trace`.

## Tech Stack

| Component     | Choice                       |
| ------------- | ---------------------------- |
| Language      | TypeScript (strict, ESM)     |
| Runtime       | Node.js 20+                  |
| CLI Framework | Commander                    |
| Validation    | Zod                          |
| Logging       | Pino + pino-pretty           |
| Spinners      | Ora                          |
| Testing       | Vitest                       |
| Linting       | ESLint 9 + typescript-eslint |
| Formatting    | Prettier                     |
| Docs          | VitePress                    |
| CI            | GitHub Actions               |
