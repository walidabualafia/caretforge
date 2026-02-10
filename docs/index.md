---
layout: home

hero:
  name: CaretForge
  text: Bring Your Own Model
  tagline: A coding-agent CLI with pluggable providers — your models, your credentials, your rules.
  image:
    src: /logo.png
    alt: CaretForge Logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/walidabualafia/caretforge

features:
  - icon: 🔌
    title: Pluggable Providers
    details: Bring your own model credentials and switch between providers. Azure AI Foundry supported out of the box, with an extensible interface for adding more.
  - icon: 🛡️
    title: Safe by Default
    details: Shell execution and file writing are disabled unless you explicitly opt in. Secrets are never printed in full. You control what the agent can do.
  - icon: ⚡
    title: Streaming & Tool Use
    details: Real-time streaming output with Server-Sent Events. The agent can read files, write files, and execute shell commands — all gated behind flags.
  - icon: 🧩
    title: Extensible Architecture
    details: Clean TypeScript codebase with a Provider interface, tool system, and agent loop. Add new providers or tools with minimal code.
---
