import process from 'node:process'

import { execFile } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { extractFile, listPackage } from '@electron/asar'

const execFileAsync = promisify(execFile)
const appDir = join(process.cwd(), 'dist', 'win-unpacked')
const waitMs = Number(process.env.PACKAGED_SMOKE_WAIT_MS ?? 15000)

if (process.platform !== 'win32') {
  throw new Error('packaged-startup-smoke currently supports Windows only')
}

const executable = (await readdir(appDir))
  .find(file => file.toLowerCase() === 'airi.exe')

if (!executable) {
  throw new Error(`Packaged executable was not found in ${appDir}`)
}

const executablePath = join(appDir, executable)
await access(executablePath)

const archivePath = join(appDir, 'resources', 'app.asar')
const archiveFiles = new Set(listPackage(archivePath, { isPack: false }))
const requiredPackages = ['superjson', 'copy-anything', 'is-what']
const missingPackages = requiredPackages.filter(name => !archiveFiles.has(`node_modules/${name}/package.json`))

if (missingPackages.length > 0) {
  throw new Error(`Packaged runtime dependencies are missing from app.asar: ${missingPackages.join(', ')}`)
}

const superjsonPackage = JSON.parse(extractFile(archivePath, 'node_modules/superjson/package.json').toString('utf8'))
const declaredDependencies = Object.keys(superjsonPackage.dependencies ?? {})
const missingSuperjsonDependencies = declaredDependencies
  .filter(name => !archiveFiles.has(`node_modules/${name}/package.json`))

if (missingSuperjsonDependencies.length > 0) {
  throw new Error(`superjson runtime dependency closure is incomplete: ${missingSuperjsonDependencies.join(', ')}`)
}

const child = execFile(executablePath, [], {
  cwd: appDir,
  windowsHide: true,
})

let output = ''
child.stdout?.on('data', (data) => {
  output += data.toString()
})
child.stderr?.on('data', (data) => {
  output += data.toString()
})

const exit = new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (code, signal) => resolve({ code, signal }))
})

const result = await Promise.race([
  exit,
  new Promise(resolve => setTimeout(resolve, waitMs, null)),
])

if (result) {
  const { code, signal } = result
  throw new Error(`Packaged AIRI exited during startup (code=${code}, signal=${signal})\n${output}`)
}

if (child.pid) {
  await execFileAsync('taskkill', ['/pid', String(child.pid), '/t', '/f'])
}

console.info(`Packaged AIRI stayed alive for ${waitMs}ms: startup smoke passed`)
