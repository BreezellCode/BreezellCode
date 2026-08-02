import { defineConfig } from "vitepress";
import { duoyuyanpeizhi } from "./duoyuyan";

export default defineConfig({
  title: "Breezell Docs",
  description: "Official documentation for Breezell",
  lang: "en-US",
  locales: {
    root: {
      label: "English",
      lang: "en-US",
    },
    ...duoyuyanpeizhi,
  },
  cleanUrls: true,
  ignoreDeadLinks: true,
  markdown: {
    theme: "material-theme-palenight",
    lineNumbers: true,
  },
  outDir: ".vitepress/dist",
  vite: {
    cacheDir: "../node_modules/.vitepress-cache",
    server: {
      watch: {
        ignored: [
          "**/docs/.vitepress/.temp/**",
          "**/docs/.vitepress/cache/**",
          "**/docs/.vitepress/dist/**",
          "**/node_modules/**",
          "**/.git/**",
        ],
      },
    },
    build: {
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        treeshake: {
          moduleSideEffects: false,
        },
      },
    },
  },

  themeConfig: {
    logo: "/logo-touming-caibian.png",
    siteTitle: "Breezell Docs",
    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "Search",
            buttonAriaLabel: "Search",
          },
          modal: {
            displayDetails: "Display detailed list",
            resetButtonTitle: "Clear search",
            backButtonTitle: "Close search",
            noResultsText: "No results for",
            footer: {
              selectText: "to select",
              selectKeyAriaLabel: "enter",
              navigateText: "to navigate",
              navigateUpKeyAriaLabel: "up arrow",
              navigateDownKeyAriaLabel: "down arrow",
              closeText: "to close",
              closeKeyAriaLabel: "escape",
            },
          },
        },
      },
    },
    outline: {
      label: "On this page",
    },
    nav: [
      {
        text: "Guide",
        link: "/introduction",
        activeMatch: "^/(introduction|settings-page-language-settings|custom-api|prompt-settings|feature-options-overview|dialog-box-overview|mode-selection|entanglement-mode-overview)(/|$)",
      },
      { text: "About", link: "/about" },
      { text: "Contact", link: "/contact" },
      { text: "Changelog", link: "/changelog" },
    ],
    socialLinks: [
      { icon: "discord", link: "https://discord.gg/gRBk8rDsc" },
      { icon: "x", link: "https://x.com/BreezellCode" },
      {
        icon: {
          svg: '<svg role="img" viewBox="0 0 24 24"><path d="M11.94 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.94 0Zm4.97 7.31c.18-.01.58.04.84.25.16.14.2.33.22.46.02.09.04.31.02.48-.22 2.32-1.16 7.95-1.64 10.55-.2 1.1-.6 1.47-.98 1.51-.83.08-1.46-.55-2.26-1.07-1.26-.82-1.97-1.33-3.19-2.13-1.41-.93-.5-1.44.31-2.28.21-.22 3.93-3.6 4-3.9.01-.04.02-.18-.07-.26-.09-.08-.22-.05-.31-.03-.13.03-2.22 1.41-6.27 4.14-.59.41-1.13.61-1.61.6-.53-.01-1.55-.3-2.31-.55-.93-.3-1.67-.46-1.6-.97.04-.27.4-.54 1.08-.81 4.22-1.84 7.03-3.05 8.44-3.64 4.02-1.67 4.86-1.96 5.34-1.97Z"/></svg>',
        },
        link: "https://t.me/BreezellCode",
        ariaLabel: "Telegram Channel",
      },
      {
        icon: {
          svg: '<svg role="img" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.93 9h-3.02a15.43 15.43 0 0 0-1.08-5.02A8.03 8.03 0 0 1 18.93 11ZM12 4.04c.74 1.06 1.58 3.05 1.88 6.96h-3.76c.3-3.91 1.14-5.9 1.88-6.96ZM4.26 13h3.82c.12 1.88.45 3.56.94 4.93A8.03 8.03 0 0 1 4.26 13Zm3.82-2H4.26a8.03 8.03 0 0 1 4.76-4.93A15.6 15.6 0 0 0 8.08 11ZM12 19.96c-.74-1.06-1.58-3.05-1.88-6.96h3.76c-.3 3.91-1.14 5.9-1.88 6.96Zm2.83-2.03c.49-1.37.82-3.05.94-4.93h3.82a8.03 8.03 0 0 1-4.76 4.93Z"/></svg>',
        },
        link: "https://breezell.com",
        ariaLabel: "Official website",
      },
    ],
    sidebar: {
      "/about": [
        {
          text: "About",
          items: [{ text: "About", link: "/about" }],
        },
        {
          text: "Get Started",
          items: [
            { text: "Introduction", link: "/introduction" },
            { text: "Language Settings", link: "/settings-page-language-settings" },
            { text: "Custom API", link: "/custom-api" },
            { text: "Prompt Settings", link: "/prompt-settings" },
            { text: "Feature Options Overview", link: "/feature-options-overview" },
          ],
        },
        {
          text: "Advanced Operations",
          items: [
            { text: "Dialog Box Overview", link: "/dialog-box-overview" },
            { text: "Mode Selection", link: "/mode-selection" },
          ],
        },
        {
          text: "Mode Guides",
          items: [
            { text: "Entanglement Mode Overview", link: "/entanglement-mode-overview" },
          ],
        },
      ],
      "/contact": [
        {
          text: "Contact",
          items: [{ text: "Contact", link: "/contact" }],
        },
        {
          text: "Get Started",
          items: [
            { text: "Introduction", link: "/introduction" },
            { text: "Language Settings", link: "/settings-page-language-settings" },
            { text: "Custom API", link: "/custom-api" },
            { text: "Prompt Settings", link: "/prompt-settings" },
            { text: "Feature Options Overview", link: "/feature-options-overview" },
          ],
        },
        {
          text: "Advanced Operations",
          items: [
            { text: "Dialog Box Overview", link: "/dialog-box-overview" },
            { text: "Mode Selection", link: "/mode-selection" },
          ],
        },
        {
          text: "Mode Guides",
          items: [
            { text: "Entanglement Mode Overview", link: "/entanglement-mode-overview" },
          ],
        },
      ],
      "/changelog": [
        {
          text: "Changelog",
          items: [{ text: "Changelog", link: "/changelog" }],
        },
        {
          text: "Get Started",
          items: [
            { text: "Introduction", link: "/introduction" },
            { text: "Language Settings", link: "/settings-page-language-settings" },
            { text: "Custom API", link: "/custom-api" },
            { text: "Prompt Settings", link: "/prompt-settings" },
            { text: "Feature Options Overview", link: "/feature-options-overview" },
          ],
        },
        {
          text: "Advanced Operations",
          items: [
            { text: "Dialog Box Overview", link: "/dialog-box-overview" },
            { text: "Mode Selection", link: "/mode-selection" },
          ],
        },
        {
          text: "Mode Guides",
          items: [
            { text: "Entanglement Mode Overview", link: "/entanglement-mode-overview" },
          ],
        },
      ],
      "/": [
        {
          text: "Get Started",
          items: [
            { text: "Introduction", link: "/introduction" },
            { text: "Language Settings", link: "/settings-page-language-settings" },
            { text: "Custom API", link: "/custom-api" },
            { text: "Prompt Settings", link: "/prompt-settings" },
            { text: "Feature Options Overview", link: "/feature-options-overview" },
          ],
        },
        {
          text: "Advanced Operations",
          items: [
            { text: "Dialog Box Overview", link: "/dialog-box-overview" },
            { text: "Mode Selection", link: "/mode-selection" },
          ],
        },
        {
          text: "Mode Guides",
          items: [
            { text: "Entanglement Mode Overview", link: "/entanglement-mode-overview" },
          ],
        },
      ],
    },
    docFooter: {
      prev: true,
      next: true,
    },
    returnToTopLabel: "Go to top",
    sidebarMenuLabel: "Menu",
    darkModeSwitchLabel: "Theme",
    lightModeSwitchTitle: "Switch to light theme",
    darkModeSwitchTitle: "Switch to dark theme",
    editLink: {
      pattern: "https://github.com/Evavic44/adocs/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
