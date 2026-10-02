# Postcode API Dashboard

A local Vite + React dashboard for testing the [NIPOST Postcode API](https://docs.postcode.gov.ng) and writing up the results.

```bash
npm install
npm run dev     # http://localhost:5173
```

Copy `.env.example` to `.env` and add your key:

```bash
cp .env.example .env
```

The Vite dev server proxies `/gw` → `api.postcode.gov.ng` and `/platform` → `platform.postcode.gov.ng`, adding the key on the server side. The secret is never sent to the browser. Only its prefix (e.g. `nipost_test`) is shown in the UI. Because the proxy only exists in dev mode, use `npm run dev`. A static `npm run build` has no proxy.

## Sections

- **Overview**: gateway health, key status, rate limit, and the API surface with check status per endpoint.
- **Playground**: send a request to any endpoint with the `.env` key, no key, or a custom key (e.g. a publishable key for the widget session). Includes live autocomplete type-ahead, a postcode segment view, and a distance chart for nearby search.
- **Test suite**: 33 automated checks. Each takes one claim from the docs/OpenAPI spec and tests it against the live API, keeping the request/response evidence.
- **Report**: builds a report from the check results. Export it as PDF (print), Markdown or raw JSON.

Results and history are saved in `localStorage`.

## Files

| File | Purpose |
|---|---|
| `vite.config.ts` | Dev proxy and server-side key injection |
| `src/api.ts` | Request client (timing, headers, timeouts) |
| `src/endpoints.ts` | Endpoint catalog and documented test postcodes |
| `src/checks.ts` | The conformance checks |
| `src/report.ts` | Report model, recommendations, Markdown export |
| `src/store.ts` | Persistence (localStorage) |
