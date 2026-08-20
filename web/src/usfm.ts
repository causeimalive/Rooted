// Maps this app's internal OSIS-style book codes (e.g. "Gen", "1Sam", "Ps",
// as used throughout bible.ts/bible.json) to the USFM book codes YouVersion's
// Platform API actually expects (e.g. "GEN", "1SA", "PSA"). YouVersion's
// endpoints are case-sensitive and, for a couple of books, use a
// non-standard code (Nahum is "NAM", not the USFM-standard "NAH"), so this
// map is verified directly against YouVersion's own /v1/bibles/{id}/books
// response rather than the generic USFM spec.
const OSIS_TO_USFM: Record<string, string> = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS',
  Judg: 'JDG', Ruth: 'RUT', '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI',
  '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH', Ezra: 'EZR', Neh: 'NEH',
  Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO', Eccl: 'ECC', Song: 'SNG',
  Isa: 'ISA', Jer: 'JER', Lam: 'LAM', Ezek: 'EZE', Dan: 'DAN', Hos: 'HOS',
  Joel: 'JOL', Amos: 'AMO', Obad: 'OBA', Jonah: 'JON', Mic: 'MIC', Nah: 'NAM',
  Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL', Matt: 'MAT',
  Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO',
  '2Cor': '2CO', Gal: 'GAL', Eph: 'EPH', Phil: 'PHP', Col: 'COL', '1Thess': '1TH',
  '2Thess': '2TH', '1Tim': '1TI', '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM',
  Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE', '1John': '1JN',
  '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
}

export function osisToUsfm(osis: string): string {
  return OSIS_TO_USFM[osis] ?? osis.toUpperCase()
}
