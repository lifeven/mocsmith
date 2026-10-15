import { defineConfig } from '@playwright/test';

const shapes = [
  ['desktop', 1440, 900], ['tablet', 820, 1180], ['tablet-wide', 1180, 820],
  ['phone', 390, 844], ['phone-wide', 874, 313], ['narrow', 320, 568],
];

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5595',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH }),
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: shapes.flatMap(([name, width, height]) => ['en-US', 'zh-CN'].map(locale => ({
    name: `${name}-${locale}`,
    use: { viewport: { width, height }, locale, hasTouch: width < 900 },
  }))),
  webServer: {
    command: 'npm run preview -- --port 5595',
    url: 'http://127.0.0.1:5595',
    reuseExistingServer: !process.env.CI,
  },
});
