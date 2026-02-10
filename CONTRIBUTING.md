# Contributing to CaretForge

Thanks for your interest in contributing! CaretForge is an open-source BYOM coding-agent CLI, and contributions of all kinds are welcome — bug reports, feature requests, documentation improvements, and code.

## Getting Started

### Prerequisites

- Node.js **20+**
- [pnpm](https://pnpm.io/) **9+**
- Git

### Setup

```bash
git clone https://github.com/walidabualafia/caretforge.git
cd caretforge
pnpm install
pnpm build
```

### Verify everything works

```bash
pnpm test        # run tests
pnpm lint        # lint with ESLint
pnpm format:check # check formatting
pnpm typecheck   # type-check without emitting
```

## Development Workflow

1. **Fork** the repository and create a branch from `main`.
2. **Make your changes** — keep commits focused and well-described.
3. **Run quality gates** before pushing:

   ```bash
   pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
   ```

4. **Open a pull request** against `main`.

### Running locally

```bash
# Build and run
pnpm build
node dist/index.js "hello"

# Or use tsx for development (no build step)
npx tsx src/index.ts "hello"

# Watch mode for TypeScript
pnpm dev
```

## Project Structure

```
src/
├── cli/         # CLI commands (Commander.js)
├── core/        # Agent loop, prompts, messages
├── providers/   # LLM provider implementations
├── config/      # Configuration loading/saving
├── tools/       # Tool definitions and executors
├── ui/          # Terminal formatting and permissions
└── util/        # Logger, errors, redaction
test/            # Vitest unit tests
docs/            # VitePress documentation
```

## Code Style

- **TypeScript** with strict mode enabled
- **ESM** modules (`"type": "module"`)
- **Prettier** for formatting (runs automatically in CI)
- **ESLint** for linting

The CI pipeline enforces all of these. Run `pnpm format` to auto-fix formatting before committing.

## Adding a New Provider

This is the most common type of contribution. See the [Adding Providers](https://walidabualafia.github.io/caretforge/guide/adding-providers.html) guide in the docs, or follow these steps:

1. Create `src/providers/myProvider.ts` implementing the `Provider` interface from `src/providers/provider.ts`.
2. Add a Zod config schema in `src/config/schema.ts`.
3. Register it in `src/cli/shared.ts` in the `resolveProvider` switch.
4. Add tests in `test/`.
5. Document it in `docs/` and update the README.

## Writing Tests

Tests use [Vitest](https://vitest.dev/) and live in the `test/` directory.

```bash
pnpm test           # run all tests once
pnpm test:watch     # run in watch mode
```

- Mock network calls — never make real API requests in tests.
- Test edge cases: invalid config, missing files, permission denials.
- Keep tests fast and isolated.

## Bug Reports

When filing a bug, please include:

- CaretForge version (`caretforge --version`)
- Node.js version (`node --version`)
- OS and shell
- Steps to reproduce
- Expected vs actual behavior
- Relevant output (use `--trace` for debug logs)

## Feature Requests

Open an issue describing:

- The problem you're trying to solve
- Your proposed solution (if you have one)
- Any alternatives you've considered

## Pull Request Guidelines

- **Keep PRs focused** — one feature or fix per PR.
- **Write descriptive commit messages** — explain the "why", not just the "what".
- **Add tests** for new functionality.
- **Update docs** if you change user-facing behavior.
- **Don't break existing tests** — all CI checks must pass.

## Security

If you discover a security vulnerability, please **do not open a public issue**. Instead, email abualafia@rocketmail.com with details. See the [Security](https://walidabualafia.github.io/caretforge/reference/security.html) docs for more.

## License

By contributing to CaretForge, you agree that your contributions will be licensed under the [MIT License](LICENSE).
