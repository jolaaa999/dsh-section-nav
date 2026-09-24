# dsh-section-nav

[English](README.md) | [简体中文](README.zh.md)

A DeepSeek Harness plugin that brings the **Section Nav for ChatGPT** experience to the DSH web client: a lightweight section rail beside the current assistant answer, with chapter bookmarks stored locally in the browser.

> This is a DSH port of [Section-Nav-for-ChatGPT](https://github.com/scandishoper/Section-Nav-for-ChatGPT) by scandishoper (MIT). The ChatGPT extension adapter and manifest were replaced with a DSH adapter and a `dsh` bundle manifest. See [`NOTICE`](NOTICE) and [`LICENSE`](LICENSE).

## Features

- **Section rail for the current answer** — headings rendered in the latest/currently read assistant answer appear in a compact rail beside the transcript.
- **Reading-position tracking** — the active section follows the transcript reading line, with the same hysteresis behavior as the original extension.
- **One-click section navigation** — clicking a heading scrolls to it and briefly highlights the target.
- **Local chapter bookmarks** — bookmark any section, reopen the bookmark drawer, and jump back later.
- **Always-visible rail** — full, compact, and mini modes follow the available space; when the ideal edge position does not fit, a mini rail stays pinned to the viewport edge instead of disappearing.
- **Full session history** — the plugin keeps pulling older history pages while the Host reports more, rebuilding the directory from the earliest loaded turn through the live tail.
- **Theme following** — the rail reads the host page's computed text and surface colors, so it follows DSH light/dark themes.
- **Bilingual copy** — Chinese and English strings are registered through the DSH locale service.
- **No server storage** — bookmarks live in `localStorage` under `dshSectionNav.bookmarks.v1`; nothing is uploaded.

## Compatibility

The plugin targets the DSH web client's chat DOM contract:

- assistant rows: `[data-chat-flow-kind="assistant-step"]`
- transcript container: `[data-chat-flow]`
- stable answer keys: `data-chat-anchor-key` / `data-chat-flow-key`
- turn indexes: `data-chat-turn`
- headings: `h1`, `h2`, `h3` inside the answer, excluding reasoning disclosures

It is a pure browser-side plugin. The host half only mounts the Loader seat; every feature lives in `lib/client.js`.

The implementation has been smoke-tested against the packaged Oh-DSH 0.1.12 runtime (`@deepseek-ai/dsh` 0.1.2-alpha.3) and follows the current DSH client contracts used by `0.1.x` web/desktop releases.

## Install

### From the plugin manager

Open **Plugins** in the DSH sidebar and use **Add plugin** with:

```text
github:jolaaa999/dsh-section-nav
```

### From the CLI

```sh
dsh plugin --profile web add github:jolaaa999/dsh-section-nav
```

The package commits its built `lib/` artifacts, so a git install does not need a build step or an install-script approval.

### From a local checkout

```sh
dsh plugin --profile web add .
```

Run that command from this repository's root. The package manifest declares `dsh.bundle.patch`, so the profile adds `dsh-section-nav` as a layer automatically.

## Usage

1. Open a DSH chat with an assistant answer containing `#`, `##`, or `###` headings.
2. The rail is always visible: it uses full/compact text when there is room and a mini edge rail otherwise.
3. Click a rail item to scroll to that heading.
4. Click the star beside a rail item to bookmark it.
5. Click the star/count button in the rail header to open the bookmark drawer.
6. Use `Escape`, a click outside, or the close button to close the drawer.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

`pnpm run build` first emits the ESM host half to `lib/index.js`, then builds the browser half to `lib/client.js` and `lib/client.js.map`.

### Repository layout

- `src/index.ts` — host half; a Loader seat with no host-side behavior.
- `src/client/index.tsx` — Cordis client entry, service injection, and lifecycle.
- `src/client/sectionNav.tsx` — controller: rail mount, trackers, bookmarks, route/session reset, and cleanup.
- `src/core/adapter.ts` — DSH chat DOM adapter; the only file with DSH selectors.
- `src/core/*` — adapted section parser, answer tracker, section tracker, rail positioning, bookmark service/resolver/recovery, and mutation watching.
- `src/client/components/*` — React rail and bookmark drawer components.
- `cordis.patch.yml` — DSH bundle layer that registers the plugin row.
- `lib/` — committed build artifacts used by git and tarball installs.

## Configuration

There are no DSH config fields. The plugin intentionally follows the original extension's behavior and persists only bookmarks:

```js
localStorage['dshSectionNav.bookmarks.v1']
```

## Known limitations

- Directory entries come from user turns; assistant heading parsing is not re-enabled in this version.
- On a very narrow viewport the rail falls back to a mini edge rail, so entries remain visible as markers; widen the window for full titles.
- Full-history loading stops when the Host has no more pages to return; sessions with unavailable older history cannot be expanded beyond what the Host serves.
- A bookmark whose answer is outside the currently loaded session window is marked unavailable until that history page loads.
- Headings inside reasoning disclosures are ignored; sections belong to the assistant's answer text.
- No cross-device bookmark sync and no server-side storage.

## Plugin marketplace metadata

Recommended GitHub repository topics:

```text
dsh
deepseek-harness
dsh-plugin
plugin
ui
sidebar
navigation
bookmarks
```

The repository is intended to be discoverable by DSH plugin catalogs that scan GitHub for `dsh-plugin` / `deepseek-harness` topics and package manifests.

## License

MIT. This port retains the original project's copyright and license notice; see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
