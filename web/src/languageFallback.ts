import type { LanguageOption } from './languageCatalog'

// Fallback snapshot of YouVersion language metadata used when the live
// /languages endpoint is unavailable or the request fails.

export const FALLBACK_LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    "tag": "en",
    "label": "English",
    "subtitle": "EN · Latin",
    "searchText": "english en latin eng bb bs bz ck gg gs gy im io ki sb cq gb ie jm kn ky tc vg gd nf vc ai je nr dm fj mh sg bm pn lc mt tt ca ag cx lr vu bw gi sz fk mu tz sh sx ms ph mw sd er fm nu ng hk pg pk zw gm cm sc tk sl za to ls ss gh in ke mg zm rw tv pw na ug ws bi um dg nz as mp au us gu vi pr cc en · latin"
  },
  {
    "tag": "es",
    "label": "Spanish",
    "subtitle": "ES · latino",
    "searchText": "spanish es latino spa español (américa latina) ar cu cl ea ic ec cr co gt sv uy gq pr ve do hn ni pe pa bo py mx us es · latino"
  },
  {
    "tag": "pt",
    "label": "Portuguese (Brazil)",
    "subtitle": "PT · latim",
    "searchText": "portuguese (brazil) pt latim por português (brasil) gw br st cv ao tl mz mo gq pt · latim"
  },
  {
    "tag": "zh",
    "label": "Chinese (Simplified)",
    "subtitle": "ZH · 简体",
    "searchText": "chinese (simplified) zh 简体 chi cmn zh-cmn zh-guoyu zho 简体中文 mo hk tw cn sg zh · 简体"
  },
  {
    "tag": "fr",
    "label": "French",
    "subtitle": "FR · latin",
    "searchText": "french fr latin fra fre français pm nc pf mc lu re bl gp mf wf mq mu cm ga yt gf cg bi sc tn cd dj ht tg ch be bj ci dz vu ca cf gq gn mg km sn bf ml ne td rw ma it fr · latin"
  },
  {
    "tag": "ru",
    "label": "Russian",
    "subtitle": "RU · кириллица",
    "searchText": "russian ru кириллица rus русский kz kg by ua ru · кириллица"
  },
  {
    "tag": "ko",
    "label": "Korean",
    "subtitle": "KO · 한국 문자",
    "searchText": "korean ko 한국 문자 kor 한국어 kr kp ko · 한국 문자"
  },
  {
    "tag": "uk",
    "label": "Ukrainian",
    "subtitle": "UK · кирилиця",
    "searchText": "ukrainian uk кирилиця ukr українська ua uk · кирилиця"
  },
  {
    "tag": "ar",
    "label": "Arabic (Standard)",
    "subtitle": "AR · العربية",
    "searchText": "arabic (standard) ar العربية ara arb eh jo kw ps sa eg tn qa bh lb mr om sy ae dz ly ye iq km ma sd so il td dj er ar · العربية"
  },
  {
    "tag": "ht",
    "label": "Haitian Creole",
    "subtitle": "HT · latin",
    "searchText": "haitian creole ht latin hat kreyòl ayisyen ht · latin"
  },
  {
    "tag": "vi",
    "label": "Vietnamese",
    "subtitle": "VI · Chữ La tinh",
    "searchText": "vietnamese vi chữ la tinh vie tiếng việt vn vi · chữ la tinh"
  },
  {
    "tag": "ro",
    "label": "Romanian",
    "subtitle": "RO · latină",
    "searchText": "romanian ro latină mo mol ron rum română md rs ro · latină"
  },
  {
    "tag": "fa",
    "label": "Farsi (Persian)",
    "subtitle": "FA · عربی",
    "searchText": "farsi (persian) fa عربی fas per pes فارسی ir af fa · عربی"
  },
  {
    "tag": "ne",
    "label": "Nepali",
    "subtitle": "NE · देवानागरी",
    "searchText": "nepali ne देवानागरी nep npi नेपाली np ne · देवानागरी"
  },
  {
    "tag": "hwc",
    "label": "Hawaii Creole English",
    "subtitle": "HWC",
    "searchText": "hawaii creole english hwc hawaii pidgin"
  },
  {
    "tag": "am",
    "label": "Amharic",
    "subtitle": "AM · ኢትዮፒክ",
    "searchText": "amharic am ኢትዮፒክ amh አማርኛ et am · ኢትዮፒክ"
  },
  {
    "tag": "id",
    "label": "Indonesian",
    "subtitle": "ID · Latin",
    "searchText": "indonesian id latin in ind bahasa indonesia id · latin"
  },
  {
    "tag": "fil",
    "label": "Tagalog",
    "subtitle": "FIL · Latin",
    "searchText": "tagalog fil latin tgl tl filipino ph fil · latin"
  },
  {
    "tag": "de",
    "label": "German",
    "subtitle": "DE · Lateinisch",
    "searchText": "german de lateinisch deu ger deutsch li at ch lu be dk pl de · lateinisch"
  },
  {
    "tag": "sm",
    "label": "Samoan",
    "subtitle": "SM",
    "searchText": "samoan sm smo gagana fa'a sāmoa ws as"
  },
  {
    "tag": "it",
    "label": "Italian",
    "subtitle": "IT · latino",
    "searchText": "italian it latino ita italiano sm ch va hr it · latino"
  },
  {
    "tag": "pl",
    "label": "Polish",
    "subtitle": "PL · łacińskie",
    "searchText": "polish pl łacińskie pol polski pl · łacińskie"
  },
  {
    "tag": "hi",
    "label": "Hindi",
    "subtitle": "HI · देवनागरी",
    "searchText": "hindi hi देवनागरी hin हिन्दी in hi · देवनागरी"
  },
  {
    "tag": "ja",
    "label": "Japanese",
    "subtitle": "JA · 日本語の文字",
    "searchText": "japanese ja 日本語の文字 jpn 日本語 jp ja · 日本語の文字"
  },
  {
    "tag": "yue",
    "label": "Chinese (Cantonese)",
    "subtitle": "YUE · 繁體",
    "searchText": "chinese (cantonese) yue 繁體 zh-yue kwóng-tung wâ mo yue · 繁體"
  },
  {
    "tag": "el",
    "label": "Modern Greek",
    "subtitle": "EL · Ελληνικό",
    "searchText": "modern greek el ελληνικό ell gre ελληνικά gr cy el · ελληνικό"
  },
  {
    "tag": "ur",
    "label": "Urdu",
    "subtitle": "UR · عربی",
    "searchText": "urdu ur عربی urd اردو pk in ur · عربی"
  },
  {
    "tag": "gu",
    "label": "Gujarati",
    "subtitle": "GU · ગુજરાતી",
    "searchText": "gujarati gu ગુજરાતી guj prp in gu · ગુજરાતી"
  },
  {
    "tag": "hy",
    "label": "Armenian (Eastern)",
    "subtitle": "HY · հայկական",
    "searchText": "armenian (eastern) hy հայկական arm hye հայերեն (արևելահայերեն) am hy · հայկական"
  },
  {
    "tag": "he",
    "label": "Hebrew",
    "subtitle": "HE · עברי",
    "searchText": "hebrew he עברי heb iw עברית il he · עברי"
  },
  {
    "tag": "pa",
    "label": "Panjabi",
    "subtitle": "PA · ਗੁਰਮੁਖੀ",
    "searchText": "panjabi pa ਗੁਰਮੁਖੀ pan ਪੰਜਾਬੀ in pa · ਗੁਰਮੁਖੀ"
  },
  {
    "tag": "bn",
    "label": "Bengali (Bangla)",
    "subtitle": "BN · বাংলা",
    "searchText": "bengali (bangla) bn বাংলা ben bd in bn · বাংলা"
  },
  {
    "tag": "mww",
    "label": "Hmong Daw",
    "subtitle": "MWW",
    "searchText": "hmong daw mww hmong"
  },
  {
    "tag": "km",
    "label": "Khmer",
    "subtitle": "KM · ខ្មែរ",
    "searchText": "khmer km ខ្មែរ khm ភាសាខ្មែរ kh km · ខ្មែរ"
  },
  {
    "tag": "nv",
    "label": "Navajo",
    "subtitle": "NV",
    "searchText": "navajo nv i-navajo nav"
  },
  {
    "tag": "te",
    "label": "Telugu",
    "subtitle": "TE · తెలుగు",
    "searchText": "telugu te తెలుగు tel in te · తెలుగు"
  },
  {
    "tag": "yi",
    "label": "Yiddish Latin Script",
    "subtitle": "YI · העברעיש",
    "searchText": "yiddish latin script yi העברעיש ji ydd yid ייִדיש yi · העברעיש"
  },
  {
    "tag": "yi",
    "label": "ייִדיש",
    "subtitle": "YI · גַלחיש",
    "searchText": "ייִדיש yi גַלחיש ji ydd yid yiddish latin script yi · גַלחיש"
  },
  {
    "tag": "pov",
    "label": "Crioulo, Upper Guinea",
    "subtitle": "POV",
    "searchText": "crioulo, upper guinea pov"
  },
  {
    "tag": "lo",
    "label": "Lao",
    "subtitle": "LO · ລາວ",
    "searchText": "lao lo ລາວ la lo · ລາວ"
  },
  {
    "tag": "th",
    "label": "Thai",
    "subtitle": "TH · ไทย",
    "searchText": "thai th ไทย tha ภาษาไทย th · ไทย"
  },
  {
    "tag": "nl",
    "label": "Dutch",
    "subtitle": "NL · Latijns",
    "searchText": "dutch nl latijns dut nld nederlands aw sr be bq cw sx nl · latijns"
  },
  {
    "tag": "ta",
    "label": "Tamil",
    "subtitle": "TA · தமிழ்",
    "searchText": "tamil ta தமிழ் tam lk sg in ta · தமிழ்"
  },
  {
    "tag": "pdc",
    "label": "Pennsylvania German",
    "subtitle": "PDC",
    "searchText": "pennsylvania german pdc pennsilfaanisch deitsch"
  },
  {
    "tag": "ml",
    "label": "Malayalam",
    "subtitle": "ML · മലയാളം",
    "searchText": "malayalam ml മലയാളം mal in ml · മലയാളം"
  },
  {
    "tag": "tr",
    "label": "Turkish",
    "subtitle": "TR · Latin",
    "searchText": "turkish tr latin tur türkçe cy tr · latin"
  },
  {
    "tag": "hnj",
    "label": "Hmong Njua",
    "subtitle": "HNJ · 𞄐𞄦𞄲𞄤𞄎𞄫𞄰 𞄚𞄜𞄲𞄔𞄬𞄱 𞄀𞄄𞄰𞄩",
    "searchText": "hmong njua hnj 𞄐𞄦𞄲𞄤𞄎𞄫𞄰 𞄚𞄜𞄲𞄔𞄬𞄱 𞄀𞄄𞄰𞄩 hmong hoa hnj · 𞄐𞄦𞄲𞄤𞄎𞄫𞄰 𞄚𞄜𞄲𞄔𞄬𞄱 𞄀𞄄𞄰𞄩"
  },
  {
    "tag": "rme",
    "label": "Romany",
    "subtitle": "RME",
    "searchText": "romany rme romany: angloromani"
  },
  {
    "tag": "hu",
    "label": "Hungarian",
    "subtitle": "HU · Latin",
    "searchText": "hungarian hu latin hun magyar rs hu · latin"
  },
  {
    "tag": "aii",
    "label": "Assyrian Neo-Aramaic",
    "subtitle": "AII",
    "searchText": "assyrian neo-aramaic aii ܐܬܘܪܝܐ ܣܘܪܝܝܐ"
  },
  {
    "tag": "ilo",
    "label": "Iloko",
    "subtitle": "ILO",
    "searchText": "iloko ilo ilokano ph"
  },
  {
    "tag": "nan",
    "label": "Chinese, Min Nan",
    "subtitle": "NAN",
    "searchText": "chinese, min nan nan zh-min-nan tw"
  },
  {
    "tag": "sw",
    "label": "Swahili",
    "subtitle": "SW · Kilatini",
    "searchText": "swahili sw kilatini swa swh kiswahili tz ug ke cd sw · kilatini"
  },
  {
    "tag": "cab",
    "label": "Garifuna",
    "subtitle": "CAB",
    "searchText": "garifuna cab karif"
  },
  {
    "tag": "sr",
    "label": "Serbian",
    "subtitle": "SR · ћирилица",
    "searchText": "serbian sr ћирилица scc srp српски srpski me rs ba xk sr · ћирилица"
  },
  {
    "tag": "aln",
    "label": "Albanian, Gheg",
    "subtitle": "ALN",
    "searchText": "albanian, gheg aln shqip: geg"
  },
  {
    "tag": "sq",
    "label": "Albanian, Tosk",
    "subtitle": "SQ · latin",
    "searchText": "albanian, tosk sq latin alb als sqi shqip: tosk al xk mk sq · latin"
  },
  {
    "tag": "hr",
    "label": "Croatian",
    "subtitle": "HR · latinica",
    "searchText": "croatian hr latinica hrv scr hrvatski ba at hr · latinica"
  },
  {
    "tag": "bg",
    "label": "Bulgarian",
    "subtitle": "BG · кирилица",
    "searchText": "bulgarian bg кирилица bul български bg · кирилица"
  },
  {
    "tag": "sv",
    "label": "Swedish",
    "subtitle": "SV · latinska",
    "searchText": "swedish sv latinska swe svenska ax se fi sv · latinska"
  },
  {
    "tag": "cs",
    "label": "Czech",
    "subtitle": "CS · latinka",
    "searchText": "czech cs latinka ces cze čeština cz cs · latinka"
  },
  {
    "tag": "mr",
    "label": "Marathi",
    "subtitle": "MR · देवनागरी",
    "searchText": "marathi mr देवनागरी mar मराठी in mr · देवनागरी"
  },
  {
    "tag": "pua",
    "label": "Western Highland Purepecha",
    "subtitle": "PUA",
    "searchText": "western highland purepecha pua"
  },
  {
    "tag": "lt",
    "label": "Lithuanian",
    "subtitle": "LT · lotynų",
    "searchText": "lithuanian lt lotynų lit lietuvių lt · lotynų"
  },
  {
    "tag": "nn",
    "label": "Norwegian Nynorsk",
    "subtitle": "NN · latinsk",
    "searchText": "norwegian nynorsk nn latinsk nno no-nyn no-nynorsk norsk: nynorsk no nn · latinsk"
  },
  {
    "tag": "bzj",
    "label": "Belize Creole English",
    "subtitle": "BZJ",
    "searchText": "belize creole english bzj bileez kriol"
  },
  {
    "tag": "kn",
    "label": "Kannada",
    "subtitle": "KN · ಕನ್ನಡ",
    "searchText": "kannada kn ಕನ್ನಡ kan in kn · ಕನ್ನಡ"
  },
  {
    "tag": "my",
    "label": "Myanmar Burmese (Unicode)",
    "subtitle": "MY · မြန်မာ",
    "searchText": "myanmar burmese (unicode) my မြန်မာ bur mya မြန်မာယူနီကုတ် mm my · မြန်မာ"
  },
  {
    "tag": "sk",
    "label": "Slovak",
    "subtitle": "SK · latinka",
    "searchText": "slovak sk latinka slk slo slovenčina sk · latinka"
  },
  {
    "tag": "da",
    "label": "Danish",
    "subtitle": "DA · latinsk",
    "searchText": "danish da latinsk dan dansk dk da · latinsk"
  },
  {
    "tag": "to",
    "label": "Tonga (Tonga Islands)",
    "subtitle": "TO · tohinima fakalatina",
    "searchText": "tonga (tonga islands) to tohinima fakalatina ton lea fakatonga to · tohinima fakalatina"
  },
  {
    "tag": "fi",
    "label": "Finnish",
    "subtitle": "FI · latinalainen",
    "searchText": "finnish fi latinalainen fin suomi se fi · latinalainen"
  },
  {
    "tag": "fub",
    "label": "Fulfulde (Adamawa)",
    "subtitle": "FUB",
    "searchText": "fulfulde (adamawa) fub"
  },
  {
    "tag": "si",
    "label": "Sinhala",
    "subtitle": "SI · සිංහල",
    "searchText": "sinhala si සිංහල sin lk si · සිංහල"
  },
  {
    "tag": "ga",
    "label": "Irish Gaelic",
    "subtitle": "GA · Laidineach",
    "searchText": "irish gaelic ga laidineach gle gaeilge ie ga · laidineach"
  },
  {
    "tag": "mk",
    "label": "Macedonian",
    "subtitle": "MK · кирилско писмо",
    "searchText": "macedonian mk кирилско писмо mac mkd македонски mk · кирилско писмо"
  },
  {
    "tag": "jam",
    "label": "Jamaican Creole English",
    "subtitle": "JAM",
    "searchText": "jamaican creole english jam jamiekan"
  },
  {
    "tag": "af",
    "label": "Afrikaans",
    "subtitle": "AF · Latyn",
    "searchText": "afrikaans af latyn afr za af · latyn"
  },
  {
    "tag": "dak",
    "label": "Dakota",
    "subtitle": "DAK",
    "searchText": "dakota dak dakhótiyapi"
  },
  {
    "tag": "ium",
    "label": "Iu Mien",
    "subtitle": "IUM",
    "searchText": "iu mien ium ภาษาอิวเมี่ยน"
  },
  {
    "tag": "lv",
    "label": "Latvian",
    "subtitle": "LV · latīņu",
    "searchText": "latvian lv latīņu lav lvs latviešu valoda lv · latīņu"
  },
  {
    "tag": "ps",
    "label": "Pushto",
    "subtitle": "PS · عربي",
    "searchText": "pushto ps عربي pbu pus پښتو af ps · عربي"
  },
  {
    "tag": "ood",
    "label": "Tohono O'odham",
    "subtitle": "OOD",
    "searchText": "tohono o'odham ood"
  },
  {
    "tag": "apw",
    "label": "Western Apache",
    "subtitle": "APW",
    "searchText": "western apache apw"
  },
  {
    "tag": "ku",
    "label": "Kurmanji Kurdish",
    "subtitle": "KU · latînî",
    "searchText": "kurmanji kurdish ku latînî kmr kur kurmancî ku · latînî"
  },
  {
    "tag": "pdt",
    "label": "Low German (Plattdeutsch)",
    "subtitle": "PDT",
    "searchText": "low german (plattdeutsch) pdt plautdietsch"
  },
  {
    "tag": "chr",
    "label": "Cherokee",
    "subtitle": "CHR · ᏣᎳᎩ",
    "searchText": "cherokee chr ꮳꮃꭹ ꮳꮃꭹ ꭶꮼꮒꭿꮝꮧ chr · ꮳꮃꭹ"
  },
  {
    "tag": "cho",
    "label": "Choctaw",
    "subtitle": "CHO · Latin",
    "searchText": "choctaw cho latin chahta cho · latin"
  }
]