import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const browserIconSource = 'C:\\Users\\cscla\\OneDrive\\Desktop\\Rooted\\Images\\Logos\\Rooted.png'
const lightSource = 'C:\\Users\\cscla\\OneDrive\\Desktop\\Rooted\\Images\\Logos\\RootedGreen.png'
const darkSource = 'C:\\Users\\cscla\\OneDrive\\Desktop\\Rooted\\Images\\Logos\\RootedTan.png'
const transparentBackground = { r: 0, g: 0, b: 0, alpha: 0 }
const browserIconScale = 2.15

function toPixels(size, scale = 1) {
  return Math.max(1, Math.round(size * scale))
}

async function writeIcon(file, sourcePath, size, background, scale = 0.68) {
  const contentSize = toPixels(size, scale)
  const content = await sharp(sourcePath)
    .trim()
    .resize(contentSize, contentSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([
      {
        input: content,
        gravity: 'centre',
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(file)
}

async function writeContainedIcon(file, size, scale = 1) {
  await writeIcon(file, lightSource, size, transparentBackground, scale)
}

async function writeBrowserIcon(file, sourcePath, size, scale = browserIconScale) {
  const scaledSize = toPixels(size, scale)
  const content = await sharp(sourcePath)
    .trim()
    .resize(scaledSize, scaledSize, {
      fit: 'contain',
      background: transparentBackground,
    })
    .png({ compressionLevel: 9 })
    .toBuffer()

  const metadata = await sharp(content).metadata()
  const width = metadata.width ?? scaledSize
  const height = metadata.height ?? scaledSize

  if (width <= size || height <= size) {
    await sharp(content).resize(size, size).toFile(file)
    return
  }

  const left = Math.max(0, Math.floor((width - size) / 2))
  const top = Math.max(0, Math.floor((height - size) / 2))

  await sharp(content)
    .extract({
      left,
      top,
      width: size,
      height: size,
    })
    .toFile(file)
}

async function writeDarkFavicon(file, size) {
  await writeBrowserIcon(file, darkSource, size)
}

const outputs = [
  [path.join(rootDir, 'public', 'favicon.png'), 32],
  [path.join(rootDir, 'public', 'favicon-dark.png'), 32],
  [path.join(rootDir, 'public', 'favicon-192.png'), 192],
  [path.join(rootDir, 'public', 'favicon-512.png'), 512],
  [path.join(rootDir, 'public', 'apple-touch-icon.png'), 180],
  [path.join(rootDir, 'public', 'branding', 'green', 'logo-32.png'), 32],
  [path.join(rootDir, 'public', 'branding', 'green', 'logo-48.png'), 48],
  [path.join(rootDir, 'public', 'branding', 'green', 'logo-64.png'), 64],
  [path.join(rootDir, 'public', 'branding', 'green', 'logo-96.png'), 96],
  [path.join(rootDir, 'public', 'branding', 'green', 'logo-128.png'), 128],
  [path.join(rootDir, 'public', 'branding', 'green', 'logo-192.png'), 192],
  [path.join(rootDir, 'public', 'branding', 'green', 'logo-256.png'), 256],
  [path.join(rootDir, 'public', 'branding', 'green', 'logo-512.png'), 512],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi', 'ic_launcher.png'), 48],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-hdpi', 'ic_launcher.png'), 72],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xhdpi', 'ic_launcher.png'), 96],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxhdpi', 'ic_launcher.png'), 144],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png'), 192],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi', 'ic_launcher_round.png'), 48],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-hdpi', 'ic_launcher_round.png'), 72],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xhdpi', 'ic_launcher_round.png'), 96],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxhdpi', 'ic_launcher_round.png'), 144],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher_round.png'), 192],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi', 'ic_launcher_foreground.png'), 48],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-hdpi', 'ic_launcher_foreground.png'), 72],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xhdpi', 'ic_launcher_foreground.png'), 96],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxhdpi', 'ic_launcher_foreground.png'), 144],
  [path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher_foreground.png'), 192],
]

await Promise.all(outputs.map(([file]) => mkdir(path.dirname(file), { recursive: true })))

for (const [file, size] of outputs) {
  const isDarkFavicon = file.endsWith('favicon-dark.png')
  const isAndroidLauncher = file.includes('android\\app\\src\\main\\res\\mipmap-') && file.includes('ic_launcher')
  const isBrowserIcon = file.includes('public\\favicon') || file.includes('public\\apple-touch-icon')
  if (isDarkFavicon) {
    await writeDarkFavicon(file, size)
  } else if (isAndroidLauncher) {
    await writeContainedIcon(file, size, 0.68)
  } else if (isBrowserIcon) {
    await writeBrowserIcon(file, browserIconSource, size)
  } else {
    await sharp(lightSource)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(file)
  }
  console.log(`Wrote ${path.relative(rootDir, file)}`)
}
