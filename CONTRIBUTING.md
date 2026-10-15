# Contributing

Issues and pull requests are welcome. For a bug report, include your browser, steps to reproduce and a small model or image you have permission to share. Do not post private files, access tokens or personal data.

Use Node 24, run `npm ci` in `app/`, then run `npm run check`. For interface changes, also check desktop, tablet and phone layouts, including short landscape windows. Keep the English and Chinese message keys aligned. Tests should use local fixtures rather than live services.

Keep changes focused. Describe the behaviour changed, the checks you ran and any limits of the validation. Include required attribution when adding third-party code, data or assets. Contributions are submitted under the applicable licences already used by the project.

## Browser checks

After `npm run check`, run these commands in `app/`:

```sh
npx playwright install chromium
npm run test:browser
```

To reuse an installed Chrome, set `CHROME_PATH` to its executable instead of installing Chromium. The tests use the production preview on port 5595, local samples and both interface languages. They check primary-control access, drawer transitions, canvas space, overflow and unwanted external photo requests. Browser emulation does not replace physical-device testing.

For a conversion change, add a small deterministic fixture that catches the intended failure. Avoid tests tied to wording, one sample's incidental part count or one arrangement of the interface. Update the relevant guide when formats or behaviour change.
