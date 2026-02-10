# CLI Commands & Flags

## Quick Start

```bash
caretforge                        # interactive chat (default)
caretforge "fix the login bug"    # one-shot task
```

CaretForge follows the same invocation pattern as [Claude Code](https://github.com/anthropics/claude-code):

- **No arguments** → interactive REPL
- **Task as argument** → one-shot execution

## Global Flags

These flags work with any command:

| Flag                | Description                  | Default     |
| ------------------- | ---------------------------- | ----------- |
| `-V, --version`     | Print version number         | —           |
| `--provider <name>` | Provider to use              | from config |
| `--model <id>`      | Model deployment ID          | from config |
| `--stream`          | Enable streaming output      | `true`      |
| `--no-stream`       | Disable streaming output     | —           |
| `--json`            | Emit structured JSON output  | `false`     |
| `--trace`           | Enable verbose debug logging | `false`     |
| `--allow-shell`     | Auto-approve shell execution | `false`     |
| `--allow-write`     | Auto-approve file writes     | `false`     |
| `-h, --help`        | Display help                 | —           |

## Permissions

By default, the agent **prompts you** before writing files or running commands:

```
  ⚡ Write to src/utils.ts
  Allow? [y]es / [n]o / [a]lways
```

| Response | Effect                                        |
| -------- | --------------------------------------------- |
| `y`      | Allow this one time                           |
| `n`      | Deny — the agent will adapt                   |
| `a`      | Allow all future calls of this type (session) |

Use `--allow-write` and `--allow-shell` to skip prompts entirely.

## Commands

### `caretforge` (default)

Start an interactive chat session. This is the default when no command is given.

```bash
caretforge
caretforge --model claude-opus-4-6
caretforge --provider azure-foundry --allow-write
```

**Slash commands** available inside the REPL:

| Command       | Description                      |
| ------------- | -------------------------------- |
| `/help`       | Show available commands          |
| `/model`      | List available models            |
| `/model <id>` | Switch model mid-conversation    |
| `/clear`      | Clear conversation history       |
| `/compact`    | Trim older messages from history |
| `/exit`       | Exit CaretForge                  |

**File context with `@`:**

Reference files directly in your prompts using the `@` prefix. Press Tab after `@` to autocomplete file paths from your working directory.

```bash
> Explain @src/core/agent.ts
> Compare @package.json with @tsconfig.json
```

Files are indexed on startup (up to 5000 files, depth 4), skipping common directories like `node_modules` and `.git`.

### `caretforge "task"` / `caretforge run [task...]`

Execute a task non-interactively.

```bash
# Shorthand (no subcommand needed)
caretforge "Explain this error: ENOENT"

# Explicit run command
caretforge run "Refactor the auth module"

# From stdin
echo "Fix the bug" | caretforge run

# With JSON output for piping
caretforge run "Count lines in src/" --json
```

**JSON output format:**

```json
{
  "task": "the task description",
  "model": "claude-opus-4-6",
  "provider": "azure-anthropic",
  "finalContent": "The agent's response...",
  "toolCallCount": 2,
  "durationMs": 4521,
  "messages": [...]
}
```

### `caretforge chat`

Explicitly start interactive chat (same as running `caretforge` with no arguments).

```bash
caretforge chat
caretforge chat --model gpt-4.1
```

### `caretforge model list`

List models configured for the active provider.

```bash
caretforge model list
caretforge model list --json
caretforge model list --provider azure-anthropic
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

### `caretforge config show`

Display the current configuration with secrets redacted.

```bash
caretforge config show
caretforge config show --json
```

### `caretforge doctor`

Validate your configuration and diagnose common issues.

```bash
caretforge doctor
```

Checks: Node.js version, config file validity, endpoint configuration, API key presence, model setup. Exit code `1` if any check fails.

## Examples

```bash
# Interactive with Claude on Azure
caretforge --model claude-opus-4-6

# One-shot task with full autonomy
caretforge "Refactor the database layer" --allow-write --allow-shell

# Debug mode — see API calls and tool execution
caretforge "Read README.md" --trace

# JSON output for scripting
caretforge "List all exports in src/index.ts" --json | jq .finalContent

# Switch provider on the fly
caretforge "Hello" --provider azure-foundry --model gpt-4.1
```
