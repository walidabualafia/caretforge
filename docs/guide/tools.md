# Tools & Permissions

CaretForge gives the AI agent access to tools that interact with your local filesystem and shell. The model always knows about all tools, but **destructive tools require your permission** before executing.

## Available Tools

### `read_file` — Always Allowed

Reads the contents of a file and returns it to the model.

```bash
caretforge "What's in package.json?"
```

### `write_file` — Requires Permission

Creates or overwrites a file with the given content. Creates parent directories as needed.

```bash
caretforge "Create a hello.py file"
```

When the model wants to write a file, you'll see:

```
  ⚡ Write to hello.py
  Allow? [y]es / [n]o / [a]lways
```

### `edit_file` — Requires Permission

Performs a surgical, in-place edit on a file by finding and replacing an exact string match. More efficient than `write_file` for small changes — the model doesn't need to re-emit the entire file.

```bash
caretforge "Fix the typo in README.md"
```

When the model wants to edit a file, you'll see:

```
  ⚡ Edit README.md
  Allow? [y]es / [n]o / [a]lways
```

Parameters:

- **`path`** — The file to edit
- **`old_string`** — Exact text to find (must match uniquely)
- **`new_string`** — Replacement text
- **`replace_all`** _(optional)_ — If `true`, replace all occurrences instead of requiring a unique match

The tool fails with a clear error if `old_string` is not found or matches multiple locations (unless `replace_all` is set). This prevents accidental edits.

### `exec_shell` — Requires Permission

Executes a shell command and returns stdout, stderr, and exit code.

```bash
caretforge "List all running processes"
```

When the model wants to run a command:

```
  ⚡ Run ls -la
  Allow? [y]es / [n]o / [a]lways
```

Features:

- **Timeout:** Default 30 seconds (configurable by the model)
- **Captures both stdout and stderr**
- **Returns exit code** for the model to interpret

::: danger
Shell execution lets the agent run arbitrary commands on your machine. Review each command before approving, or only use `--allow-shell` in trusted environments.
:::

## Permission Model

CaretForge uses an interactive permission model inspired by [Claude Code](https://github.com/anthropics/claude-code):

1. The model **always knows about all tools** (read, write, shell)
2. Safe tools (`read_file`) execute automatically
3. Dangerous tools (`write_file`, `exec_shell`) prompt you first
4. You choose: **allow once**, **deny**, or **always allow** for the session

### Permission Responses

| Response | Effect                                                         |
| -------- | -------------------------------------------------------------- |
| `y`      | Allow this one time                                            |
| `n`      | Deny — the model gets a "permission denied" message and adapts |
| `a`      | Allow all future calls of this type for the session            |

### Command Safety Analysis

Before any shell command is executed (even with `--allow-shell`), CaretForge classifies it into a risk tier:

| Risk Level      | Behavior                                                    | Examples                                        |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| **Safe**        | Auto-approved with `--allow-shell`; normal prompt otherwise | `ls`, `cat`, `grep`, `git status`, `node -v`    |
| **Mutating**    | Normal permission prompt                                    | `npm install`, `git commit`, `mkdir`            |
| **Destructive** | Always prompts (even with `--allow-shell`), shown in red    | `rm`, `sudo`, `chmod -R`, `kill -9`, `shutdown` |
| **Blocked**     | Denied outright — never executed                            | `rm -rf /`, fork bombs, `curl ... \| bash`      |

Piped and chained commands (using `|`, `&&`, or `;`) are analyzed segment by segment. If any segment is destructive or blocked, the entire command inherits that classification.

### Write Path Safety

File write operations are also classified by path:

- **Blocked paths** (always denied): `/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/boot/`, `/dev/`, `/proc/`, `/sys/`, `~/.ssh/`, `~/.gnupg/`, `~/.aws/credentials`, `~/.azure/`, `~/.kube/config`, `.env`, `.env.local`
- **Destructive paths** (always prompt): `~/.bashrc`, `~/.zshrc`, `~/.profile`, `~/.gitconfig`, `~/.npmrc`

### Auto-Approve Flags

To skip prompts entirely:

```bash
caretforge --allow-write                # auto-approve all file writes
caretforge --allow-shell                # auto-approve all shell commands
caretforge --allow-write --allow-shell  # full autonomy
```

::: warning
Even with `--allow-shell`, destructive commands still prompt for approval. Blocked commands are always denied regardless of flags.
:::

### Non-Interactive Mode

When stdin is not a TTY (piped input, CI/CD), permission prompts are not possible. In this case:

- Tools without `--allow-write` / `--allow-shell` flags are **denied**
- The model receives a "permission denied" message and adapts

```bash
# This works — flag auto-approves writes
echo "Create hello.py" | caretforge run --allow-write

# This denies the write — can't prompt in non-TTY
echo "Create hello.py" | caretforge run
```

## How Tool Calling Works

```
You: "What version of Node is in the Dockerfile?"
  ↓
Model: tool_call → read_file("Dockerfile")
  ↓
CaretForge: executes read_file, returns file contents
  ↓
Model: "The Dockerfile uses Node 20-alpine."
```

The agent loop continues until the model produces a text-only response (or hits the iteration limit of 20).

## Tool Output Display

Tool calls are displayed inline during execution:

```
  ▶ Read package.json
    42 lines

  ▶ Write src/hello.ts
    ✓ Wrote 15 lines to /Users/you/project/src/hello.ts

  ▶ Edit src/utils.ts
    ✓ Edited src/utils.ts: replaced 1 occurrence (no line count change)

  ▶ $ npm test
    ✓ exit 0
    All 28 tests passed
```

## Safety Design

- **Permission prompts by default:** No destructive tool runs without your say-so
- **Command safety analysis:** Every shell command and write path is classified by risk level before execution
- **Session-scoped "always":** The `a` response only lasts for the current session
- **No implicit escalation:** The model cannot bypass the permission system
- **Iteration limit:** The agent loop stops after 20 iterations
- **Shell timeout:** Commands timeout after 30 seconds by default
