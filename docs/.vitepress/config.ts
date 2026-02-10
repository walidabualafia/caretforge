import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'CaretForge',
  description: 'BYOM coding-agent CLI with pluggable providers',
  base: '/caretforge/',
  head: [['link', { rel: 'icon', href: '/caretforge/logo.png' }]],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Guide', link: '/getting-started/installation' },
      { text: 'CLI Reference', link: '/reference/cli' },
      { text: 'GitHub', link: 'https://github.com/walidabualafia/caretforge' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Quick Start', link: '/getting-started/quickstart' },
          { text: 'Configuration', link: '/getting-started/configuration' },
        ],
      },
      {
        text: 'Guide',
        items: [
          { text: 'Azure AI Foundry Setup', link: '/guide/azure-setup' },
          { text: 'Tools & Permissions', link: '/guide/tools' },
          { text: 'Adding a Provider', link: '/guide/adding-providers' },
          { text: 'Architecture', link: '/guide/architecture' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI Commands & Flags', link: '/reference/cli' },
          { text: 'Configuration File', link: '/reference/configuration' },
          { text: 'Environment Variables', link: '/reference/environment' },
          { text: 'Security', link: '/reference/security' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/walidabualafia/caretforge' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 CaretForge Contributors',
    },

    search: {
      provider: 'local',
    },
  },
});
