# CLI Commands & Flags

## Global Flags

These flags work with any command:

| Flag                | Description                  | Default         |
| ------------------- | ---------------------------- | --------------- |
| `-V, --version`     | Print version number         | —               |
| `--provider <name>` | Provider to use              | `azure-foundry` |
| `--model <id>`      | Model deployment ID          | `gpt-4o`        |
| `--stream`          | Enable streaming output      | `true`          |
| `--no-stream`       | Disable streaming output     | —               |
| `--json`            | Emit structured JSON output  | `false`         |
| `--trace`           | Enable verbose debug logging | `false`         |
| `--allow-shell`     | Enable shell execution tool  | `false`         |
| `--allow-write`     | Enable file write tool       | `false`         |
| `-h, --help`        | Display help                 | —               |

## Commands

### `caretforge chat`

Start an interactive chat session.

```bash
caretforge chat
caretforge chat --model gpt-4.1
caretforge chat --no-stream --allow-write
```

- Maintains conversation history across turns
- Type `exit` or `quit` to end the session
- Ctrl+C also exits

### `caretforge run [task...]`

Execute a task non-interactively.

```bash
# From arguments
caretforge run "Explain this error: ENOENT"

# From stdin
echo "Fix the bug" | caretforge run

# With JSON output for piping
caretforge run "Count lines in src/" --json
```

The task can be provided as command arguments or piped via stdin. If both are empty, an error is shown.

**JSON output format:**

```json
{
  "task": "the task description",
  "model": "gpt-4.1",
  "provider": "azure-foundry",
  "finalContent": "The agent's response...",
  "toolCallCount": 2,
  "durationMs": 4521,
  "messages": [...]
}
```

### `caretforge model list`

List models configured for the active provider.

```bash
caretforge model list
caretforge model list --json
caretforge model list --provider azure-agents
```

### `caretforge config init`

Create a starter configuration file.

```bash
caretforge config init
caretforge config init --with-secrets
```

| Option           | Description                             |
| ---------------- | --------------------------------------- |
| `--with-secrets` | Include placeholder API key in the file |

Fails if a config file already exists. Delete it first to re-initialize.

### `caretforge config show`

Display the current configuration with secrets redacted.

```bash
caretforge config show
caretforge config show --json
```

API keys are displayed as `EUSF****2I` (first 4 + last 2 characters).

### `caretforge doctor`

Validate your configuration and diagnose common issues.

```bash
caretforge doctor
```

Checks performed:

- Node.js version (>= 20 required)
- Config file existence and validity
- Azure endpoint configuration
- API key presence
- Model configuration

Exit code is `1` if any check fails, `0` otherwise.

## Examples

```bash
# Quick one-shot with streaming
caretforge run "What does this regex do: ^[a-z]+$"

# Interactive chat with full tool access
caretforge chat --allow-write --allow-shell --model gpt-4.1

# Debug mode
caretforge run "Read README.md" --trace

# JSON output for scripting
caretforge run "List all exports in src/index.ts" --json | jq .finalContent

# Use a specific provider
caretforge run "Hello" --provider azure-agents
```
