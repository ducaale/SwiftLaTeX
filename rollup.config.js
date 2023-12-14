import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy'

const workers = [
  'native/pdftex.wasm/swiftlatexpdftex.js',
  'native/xetex.wasm/swiftlatexxetex.js',
  'native/dvipdfm.wasm/swiftlatexdvipdfm.js'
]

export default [
  ...workers.map((input) => ({
    input,
    output: { dir: 'dist', format: 'esm' },
    plugins: [ nodeResolve(), commonjs(), terser() ]
  })),
  {
    input: 'index.js',
    output: { dir: 'dist', format: 'esm' },
    plugins: [
      nodeResolve(),
      commonjs(),
      copy({
        targets: [{
          src: 'native/**/swiftlatex*.wasm', dest: 'dist'
        }]
      })
    ]
  },
]
