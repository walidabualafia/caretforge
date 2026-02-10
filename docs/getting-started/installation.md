# Installation

## Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **pnpm 9+** — [Install guide](https://pnpm.io/installation)

Check your versions:

```bash
node --version   # Should be >= 20
pnpm --version   # Should be >= 9
```

## Install from Source

```bash
git clone https://github.com/walidabualafia/caretforge.git
cd caretforge
pnpm install
pnpm build
```

## Link the CLI Globally

After building, link the binary so you can use `caretforge` from anywhere:

```bash
pnpm link --global
```

Verify it works:

```bash
caretforge --version
# 0.1.0
```

## Running without Installing Globally

If you prefer not to link globally, you can run directly:

```bash
# From the project directory
node dist/index.js --help

# Or using npx/tsx for development
npx tsx src/index.ts --help
```

## What's Next?

Head to the [Quick Start](/getting-started/quickstart) to configure your first provider and start chatting.
