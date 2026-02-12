# Security

CaretForge is designed with security-conscious defaults.

## First-Launch Disclaimer

On first run, CaretForge displays a disclaimer explaining what it can do:

```
  ⚠  Disclaimer

  CaretForge is an AI-powered coding agent that operates in your current directory.
  It can:
    • Read any file in your working directory
    • Write files (with your permission per action)
    • Execute shell commands (with your permission per action)

  By continuing, you accept that you use this tool at your own risk.

  Accept? [y]es / [n]o
```

- You must explicitly accept to continue
- The prompt appears **every time** you start a session — acceptance is never cached
- Non-TTY environments (piped input) cannot accept and will exit

## Secret Handling

### Redaction

API keys and other secrets are **never printed in full**. The `config show` command and all log output use a redaction helper:

```
Full key:    AbCdEfGhIjKlMnOpQrStUvWx...
Redacted:    AbCd****Wx
```

The redactor shows the first 4 and last 2 characters. Keys shorter than 8 characters are fully masked as `******`.

### Config File

- `caretforge config init` creates a config file **without** API keys by default
- Use `--with-secrets` only if you want a placeholder key in the file
- **Never commit your config file** if it contains real secrets

### Environment Variables

For production and CI/CD, prefer environment variables over config files:

```bash
export CARETFORGE_AZURE_API_KEY="your-key"
```

This keeps secrets out of the filesystem entirely.

## Tool Permissions

### Default: Read-Only

Without any flags, the agent can only **read files**. It cannot:

- Write or create files
- Execute shell commands
- Modify your system in any way

### Opt-In Escalation

| Flag            | Enables                    | Risk Level |
| --------------- | -------------------------- | ---------- |
| _(none)_        | `read_file` only           | Low        |
| `--allow-write` | `read_file` + `write_file` | Medium     |
| `--allow-shell` | `read_file` + `exec_shell` | High       |
| Both flags      | All three tools            | High       |

### Command Safety Analysis

Before any shell command or file write is executed, CaretForge classifies it into a risk tier:

| Risk Level      | Behavior                                                     |
| --------------- | ------------------------------------------------------------ |
| **Safe**        | Auto-approved with `--allow-shell`; normal prompt otherwise  |
| **Mutating**    | Normal permission prompt                                      |
| **Destructive** | Always prompts, even with `--allow-shell`, shown with red warning |
| **Blocked**     | Denied outright — never executed                              |

#### Safe Commands

Read-only commands that cannot modify your system: `ls`, `cat`, `head`, `tail`, `grep`, `find`, `git status`, `git log`, `git diff`, `node -v`, `npm ls`, `pnpm outdated`, `tree`, `stat`, `wc`, and similar.

#### Destructive Commands

Commands that can cause significant damage: `rm`, `dd`, `chmod -R`, `chown -R`, `kill -9`, `killall`, `sudo`, `su`, `shutdown`, `reboot`, `systemctl stop`, `iptables`, and redirecting to absolute paths.

#### Blocked Commands

Outright dangerous patterns that are never allowed:

- `rm -rf /` — recursive deletion at filesystem root
- `rm -rf ~` — recursive deletion of home directory
- `rm -rf .` — recursive deletion of current directory
- Fork bombs (e.g. `:(){ :|:& };:`)
- `mkfs` — filesystem format
- `dd of=/dev/...` — direct disk write
- `curl ... | bash`, `wget ... | sh` — piping remote scripts into shell
- Truncating system configuration files (`: > /etc/...`)

#### Piped and Chained Commands

Commands using `|`, `&&`, or `;` are split and each segment is analyzed independently. If any segment is destructive or blocked, the entire command inherits that classification.

### Write Path Safety

File write targets are also classified:

**Blocked write paths** (always denied):

- System directories: `/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/boot/`, `/dev/`, `/proc/`, `/sys/`
- Credential files: `~/.ssh/`, `~/.gnupg/`, `~/.aws/credentials`, `~/.azure/`, `~/.kube/config`
- Environment secrets: `.env`, `.env.local`

**Destructive write paths** (always prompt):

- Shell configs: `~/.bashrc`, `~/.zshrc`, `~/.profile`, `~/.bash_profile`
- Tool configs: `~/.gitconfig`, `~/.npmrc`

### Shell Execution Safety

When `--allow-shell` is enabled:

- Commands run with a **30-second timeout** by default
- Both stdout and stderr are captured
- The exit code is returned to the model
- Commands run in the current working directory
- **Safe** commands are auto-approved
- **Destructive** commands still prompt for approval

::: danger
There is no sandboxing. `--allow-shell` gives the model the ability to run any command your user can run. Use it only when you trust the model and the context.
:::

## File Indexing Governance

The `@` file context system indexes your working directory on startup. To do this safely, CaretForge enforces a 7-point governance model:

### 1. File Size Limits

- **Index cap:** Files larger than **1 MB** are skipped during indexing
- **Expansion cap:** When you reference a file with `@`, only the first **256 KB** of content is included
- **Line caps:** Expanded files are limited to **2,000 lines**, and individual lines are truncated at **2,000 characters**

### 2. `.gitignore` Respect

When your working directory is a git repository, CaretForge uses `git ls-files --cached --others --exclude-standard` to discover files. This automatically respects all `.gitignore` rules, ensuring that ignored files (build artifacts, dependencies, etc.) are never indexed.

### 3. Binary File Detection

Only known text file types are indexed. CaretForge maintains a whitelist of 120+ text file extensions (`.js`, `.ts`, `.py`, `.md`, `.json`, `.yaml`, etc.) and known text filenames (`Makefile`, `Dockerfile`, `LICENSE`, etc.). Files that don't match the whitelist are skipped.

### 4. Symlink Safety

- Symbolic links are followed, but **cycle detection** prevents infinite loops (via `realpath` tracking)
- Special files (FIFOs, sockets, character/block devices) are always skipped
- Broken symlinks are silently ignored

### 5. Timeout Guard

Indexing is limited to **10 seconds**. If the deadline is reached, indexing stops gracefully and returns whatever files were collected so far. The startup message indicates whether indexing timed out.

### 6. `.caretforgeignore` Support

Create a `.caretforgeignore` file in your project root to exclude additional files from indexing. The format is gitignore-style:

```
# Comments start with #
secret.key          # Exact filename
logs/               # Directory pattern
*.log               # Glob (files ending in .log)
dist/               # Path prefix
```

Patterns in `.caretforgeignore` are applied on top of `.gitignore` rules (both are respected).

### 7. File Size Display

During interactive `@` browsing, file sizes are displayed next to each file name for visibility:

```
  src/core/agent.ts (5.2 KB)
  src/cli/chat.ts (3.8 KB)
  package.json (1.1 KB)
```

On startup, indexing statistics are shown:

```
  Indexed 142 files (git) · skipped 3 binary, 1 large, 0 ignored
```

### Indexing Limits

| Limit         | Value  |
| ------------- | ------ |
| Max files     | 5,000  |
| Max depth     | 4      |
| Max file size | 1 MB   |
| Timeout       | 10 s   |

## Agent Loop Limits

The agent loop has a maximum of **20 iterations** to prevent runaway tool calling. If the model keeps requesting tools beyond this limit, the loop terminates with a warning.

## Network Security

- All API calls use HTTPS
- API keys are sent via headers (`api-key`), never in URLs
- Azure CLI tokens are cached in memory, never written to disk
- No telemetry data is sent (the telemetry flag is a placeholder)

## Recommendations

1. **Use environment variables** for API keys in shared or production environments
2. **Never enable `--allow-shell`** unless you're in a controlled environment
3. **Review tool calls** in `--trace` mode if you want to audit what the agent does
4. **Add your config path to `.gitignore`** if working in a repo that might be shared
5. **Rotate API keys** periodically, especially if they've been exposed in logs
