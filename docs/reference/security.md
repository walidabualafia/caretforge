# Security

CaretForge is designed with security-conscious defaults.

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

### Shell Execution Safety

When `--allow-shell` is enabled:

- Commands run with a **30-second timeout** by default
- Both stdout and stderr are captured
- The exit code is returned to the model
- Commands run in the current working directory

::: danger
There is no sandboxing. `--allow-shell` gives the model the ability to run any command your user can run. Use it only when you trust the model and the context.
:::

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
