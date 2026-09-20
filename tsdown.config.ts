import { defineConfig } from 'tsdown'

/** Platform modules the DSH web shell already seeds into its browser module table. */
const platformExternals = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
])

const isPlatformExternal = (specifier: string): boolean => platformExternals.has(specifier)

/**
 * Builds the browser half of the plugin as one loader factory bundle. The host
 * half is emitted by `tsc -p tsconfig.build.json` before this config runs.
 */
export default defineConfig({
  name: 'dsh-section-nav/client',
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  fixedExtension: false,
  sourcemap: true,
  clean: false,
  dts: false,
  deps: {
    neverBundle: isPlatformExternal,
    alwaysBundle: (specifier: string) => !isPlatformExternal(specifier),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-section-nav", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
