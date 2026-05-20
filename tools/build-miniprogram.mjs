import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import * as sass from 'sass'

const projectRoot = process.cwd()
const miniprogramRoot = path.join(projectRoot, 'miniprogram')

function walk(dir, predicate, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, predicate, results)
      continue
    }
    if (predicate(fullPath)) {
      results.push(fullPath)
    }
  }
  return results
}

function compileTypeScript() {
  const tsFiles = walk(miniprogramRoot, (file) => file.endsWith('.ts'))
  for (const file of tsFiles) {
    const source = fs.readFileSync(file, 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        strict: false,
        esModuleInterop: true,
      },
      fileName: file,
    })

    const outFile = file.replace(/\.ts$/, '.js')
    fs.writeFileSync(outFile, outputText, 'utf8')
  }
}

function compileScss() {
  const scssFiles = walk(miniprogramRoot, (file) => file.endsWith('.scss'))
  for (const file of scssFiles) {
    const result = sass.compile(file, {
      style: 'expanded',
      loadPaths: [miniprogramRoot],
    })
    const outFile = file.replace(/\.scss$/, '.wxss')
    fs.writeFileSync(outFile, result.css, 'utf8')
  }
}

compileTypeScript()
compileScss()
console.log('Mini program TS/SCSS build complete.')
