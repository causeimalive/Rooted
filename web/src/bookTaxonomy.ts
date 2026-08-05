// Canonical Testament + Genre grouping for the 66 Protestant-canon books,
// keyed by the same short book codes used throughout the app (Verse.book /
// NetworkNode.bookId), e.g. 'Gen', '1Cor', 'Rev'.

export type Testament = 'OT' | 'NT'

export type Genre =
  | 'Law'
  | 'History'
  | 'Wisdom'
  | 'MajorProphets'
  | 'MinorProphets'
  | 'Gospels'
  | 'Acts'
  | 'PaulineEpistles'
  | 'GeneralEpistles'
  | 'Apocalyptic'

type GenreGroup = {
  genre: Genre
  testament: Testament
  books: string[]
}

// Order matters: this is canonical reading order, and also drives the
// GENRE_ORDER export used for iteration (e.g. building filter chips).
const GENRE_GROUPS: GenreGroup[] = [
  { genre: 'Law', testament: 'OT', books: ['Gen', 'Exod', 'Lev', 'Num', 'Deut'] },
  { genre: 'History', testament: 'OT', books: ['Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth'] },
  { genre: 'Wisdom', testament: 'OT', books: ['Job', 'Ps', 'Prov', 'Eccl', 'Song'] },
  { genre: 'MajorProphets', testament: 'OT', books: ['Isa', 'Jer', 'Lam', 'Ezek', 'Dan'] },
  { genre: 'MinorProphets', testament: 'OT', books: ['Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal'] },
  { genre: 'Gospels', testament: 'NT', books: ['Matt', 'Mark', 'Luke', 'John'] },
  { genre: 'Acts', testament: 'NT', books: ['Acts'] },
  { genre: 'PaulineEpistles', testament: 'NT', books: ['Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm'] },
  { genre: 'GeneralEpistles', testament: 'NT', books: ['Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude'] },
  { genre: 'Apocalyptic', testament: 'NT', books: ['Rev'] },
]

export const GENRE_ORDER: Genre[] = GENRE_GROUPS.map((g) => g.genre)

const bookToGenre = new Map<string, Genre>()
const bookToTestament = new Map<string, Testament>()
const genreToBooks = new Map<Genre, string[]>()
const genreToTestament = new Map<Genre, Testament>()

for (const group of GENRE_GROUPS) {
  genreToBooks.set(group.genre, group.books)
  genreToTestament.set(group.genre, group.testament)
  for (const book of group.books) {
    bookToGenre.set(book, group.genre)
    bookToTestament.set(book, group.testament)
  }
}

export function getGenreForBook(bookCode: string): Genre | undefined {
  return bookToGenre.get(bookCode)
}

export function getTestamentForBook(bookCode: string): Testament | undefined {
  return bookToTestament.get(bookCode)
}

export function getBooksForGenre(genre: Genre): string[] {
  return genreToBooks.get(genre) ?? []
}

export function getTestamentForGenre(genre: Genre): Testament | undefined {
  return genreToTestament.get(genre)
}

export function getGenresForTestament(testament: Testament): Genre[] {
  return GENRE_GROUPS.filter((g) => g.testament === testament).map((g) => g.genre)
}
