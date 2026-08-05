import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rawPath = path.join(__dirname, '../public/data/kjv_raw.json')
const outPath = path.join(__dirname, '../public/data/bible.json')

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'))
const books = raw.books ?? [raw]
const verses = []

for (const book of books) {
  for (const chapter of book.chapters) {
    for (const v of chapter.verses) {
      verses.push({
        id: `${book.book}.${chapter.chapter}.${v.number}`,
        book: book.book,
        bookName: book.englishName || book.book,
        bookId: book.bookId,
        testament: book.testament,
        chapter: chapter.chapter,
        verse: v.number,
        text: v.text,
        translation: raw.version || book.version || 'kjv',
      })
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(verses, null, 2))
console.log(`Wrote ${verses.length} verses to ${outPath}`)
