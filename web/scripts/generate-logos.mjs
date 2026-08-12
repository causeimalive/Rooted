import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const SOURCES = {
  tan: 'C:\\Users\\cscla\\OneDrive\\Desktop\\Rooted\\Images\\Logos\\RootedTan.png',
  green: 'C:\\Users\\cscla\\OneDrive\\Desktop\\Rooted\\Images\\Logos\\RootedGreen.png',
}

const PHONE_ICON_SOURCE = 'C:\\Users\\cscla\\OneDrive\\Desktop\\Rooted\\Images\\Logos\\Rooted.png'

const WORDMARK_SOURCES = {
  tan: 'C:\\Users\\cscla\\OneDrive\\Desktop\\Rooted\\Images\\Logos\\MasterFullAbideTan.png',
  green: 'C:\\Users\\cscla\\OneDrive\\Desktop\\Rooted\\Images\\Logos\\MasterFullAbideGreen.png',
}

const OUTPUT_DIR = path.join(rootDir, 'public', 'branding')

// Sizes used across the app: header logo (with @2x/@3x for retina),
// favicon, and PWA manifest icons.
const SIZES = [32, 48, 64, 96, 128, 192, 256, 512]

// Heights used for the full wordmark lockup (icon + "Rooted in Christ" text)
// in the header, with @2x/@3x variants for retina.
const WORDMARK_HEIGHTS = [40, 56, 64, 80, 96, 112, 128, 168, 192]

async function generateVariant(colorName, sourcePath) {
  const outDir = path.join(OUTPUT_DIR, colorName)
  await mkdir(outDir, { recursive: true })

  for (const size of SIZES) {
    const outputPath = path.join(outDir, `logo-${size}.png`)
    await sharp(sourcePath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(outputPath)
    console.log(`Generated ${path.relative(rootDir, outputPath)}`)
  }
}

async function generatePhoneIcon(file, size) {
  await sharp(PHONE_ICON_SOURCE)
    .trim()
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(file)
}

async function generateWordmarkVariant(colorName, sourcePath) {
  const outDir = path.join(OUTPUT_DIR, colorName)
  await mkdir(outDir, { recursive: true })

  for (const height of WORDMARK_HEIGHTS) {
    const outputPath = path.join(outDir, `wordmark-${height}.png`)
    await sharp(sourcePath)
      .resize({ height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(outputPath)
    console.log(`Generated ${path.relative(rootDir, outputPath)}`)
  }
}

async function main() {
  for (const [colorName, sourcePath] of Object.entries(SOURCES)) {
    await generateVariant(colorName, sourcePath)
  }
  for (const [colorName, sourcePath] of Object.entries(WORDMARK_SOURCES)) {
    await generateWordmarkVariant(colorName, sourcePath)
  }
  console.log('Logo generation complete.')
}

main().catch((error) => {
  console.error('Failed to generate logos:', error)
  process.exitCode = 1
})
