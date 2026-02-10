# Tools & Permissions

CaretForge gives the AI agent access to tools that interact with your local filesystem and shell. All potentially destructive tools are **disabled by default**.

## Available Tools

### `read_file` — Always Enabled

Reads the contents of a file and returns it to the model.

```bash
# The agent can read files without any special flags
caretforge run "What's in package.json?"
```

The model sends a tool call like:

```json
{ "name": "read_file", "arguments": { "path": "package.json" } }
```

### `write_file` — Requires `--allow-write`

Creates or overwrites a file with the given content.

```bash
caretforge run "Create a hello.py file" --allow-write
```

Without the flag, the agent gets an error message:

```
Error: File writing is disabled. Pass --allow-write to enable this tool.
```

### `exec_shell` — Requires `--allow-shell`

Executes a shell command and returns stdout/stderr.

```bash
caretforge run "List all running processes" --allow-shell
```

Features:

- **Timeout:** Default 30 seconds (configurable by the model)
- **Captures both stdout and stderr**
- **Returns exit code** for the model to interpret

::: danger
`--allow-shell` lets the agent run arbitrary commands on your machine. Only use this in trusted environments or sandboxed containers.
:::

## How Tool Calling Works

1. You send a message to the agent
2. The model decides it needs to use a tool and returns a `tool_calls` response
3. CaretForge executes the tool locally
4. The result is sent back to the model
5. The model processes the result and may call more tools or return a final answer

This loop continues until the model produces a text-only response (or hits the iteration limit of 20).

```
You: "What version of Node is in the Dockerfile?"
  ↓
Model: tool_call → read_file("Dockerfile")
  ↓
CaretForge: executes read_file, returns file contents
  ↓
Model: "The Dockerfile uses Node 20-alpine."
```

## Combining Flags

You can enable multiple tools at once:

```bash
# Full access
caretforge chat --allow-write --allow-shell

# Read-only (default) — no flags needed
caretforge chat
```

## Safety Design

- **Opt-in only:** Destructive tools require explicit flags
- **No implicit escalation:** The model cannot enable tools on its own
- **Iteration limit:** The agent loop stops after 20 iterations to prevent runaway tool calls
- **Timeout:** Shell commands have a 30-second timeout by default
