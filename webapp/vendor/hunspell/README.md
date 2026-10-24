# Hunspell (WebAssembly)

Unverändert aus dem npm-Paket [`hunspell-wasm`](https://github.com/rotemdan/hunspell-wasm) 0.3.0 (Rotem Dan), WebAssembly-Fassung von [Hunspell](https://github.com/hunspell/hunspell).

Lizenz: wahlweise MPL 1.1, LGPL 2 oder GPL 2 (`COPYING.MPL`, `COPYING.LESSER`, `COPYING`).

Verwendet werden nur `dist/Hunspell.js`, `dist/Utilities.js`, `dist/WasmMemoryManager.js`, `dist/Utf8.js` und `wasm/`. `spell.js` lädt sie erst bei Bedarf per `import()`.
