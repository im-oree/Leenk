// Zoja Website Studio: stamps every HTML element in src/ with data-studio-loc="file:line:col"
// so the studio knows where each element lives in the code and can deploy edits to it.
// A Vite port of OED_WEBSITE's src/studio/webpack/studio-loader.js. The attribute is inert
// outside the studio.
import path from 'node:path'
import { parse } from '@babel/parser'

const ATTR = 'data-studio-loc'
const SKIP_TAGS = new Set([
  'html', 'head', 'body', 'script', 'style', 'meta', 'link', 'title', 'noscript',
  'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'defs',
  'clipPath', 'mask', 'use', 'stop', 'linearGradient', 'radialGradient', 'filter',
  'tspan', 'symbol', 'pattern', 'foreignObject',
])
const SOURCE = /\/src\/.+\.(jsx|tsx|js|ts)$/

const isNode = (v) => v && typeof v === 'object' && typeof v.type === 'string'
function walk(node, visit) {
  visit(node)
  for (const key in node) {
    if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue
    const v = node[key]
    if (Array.isArray(v)) v.forEach((c) => isNode(c) && walk(c, visit))
    else if (isNode(v)) walk(v, visit)
  }
}
const shouldStamp = (name) =>
  (name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name) && !SKIP_TAGS.has(name.name)) ||
  (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier' && ['motion', 'm'].includes(name.object.name))

export default function zojaStudio() {
  let root = process.cwd()
  return {
    name: 'zoja-studio-stamp',
    enforce: 'pre',
    configResolved(config) { root = config.root },
    transform(code, id) {
      const file = id.split('?')[0]
      if (!SOURCE.test(file) || file.includes('/node_modules/') || !code.includes('<')) return null
      let ast
      try {
        ast = parse(code, { sourceType: 'module', plugins: /\.tsx?$/.test(file) ? ['typescript', 'jsx'] : ['jsx'] })
      } catch {
        return null
      }
      const rel = path.relative(root, file).split(path.sep).join('/')
      const inserts = []
      walk(ast.program, (node) => {
        if (node.type !== 'JSXOpeningElement' || !shouldStamp(node.name)) return
        if (node.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === ATTR)) return
        const { line, column } = node.loc.start
        inserts.push({ pos: node.name.end, text: ` ${ATTR}="${rel}:${line}:${column}"` })
      })
      if (!inserts.length) return null
      inserts.sort((a, b) => b.pos - a.pos)
      let out = code
      for (const { pos, text } of inserts) out = out.slice(0, pos) + text + out.slice(pos)
      return { code: out, map: null }
    },
  }
}
