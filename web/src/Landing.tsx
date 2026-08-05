import { BookOpen, Map as MapIcon, Search, Share2, StickyNote, Book, LogIn, Sun, Moon, ArrowRight, ShieldCheck } from 'lucide-react'

const FEATURES = [
  {
    icon: Search,
    title: 'Deep Search',
    body: 'Search the full text of Scripture by keyword, topic, phrase, or verse reference, then jump straight into the reader, map, or network graph.',
  },
  {
    icon: BookOpen,
    title: 'Parallel Reader',
    body: 'Read book by book and compare multiple translations side-by-side so you can see how wording shapes meaning.',
  },
  {
    icon: Share2,
    title: 'Relational Network Graph',
    body: 'Explore how verses, themes, people, and places connect through shared language and cross-references in a navigable 3D graph.',
  },
  {
    icon: MapIcon,
    title: 'Scripture Geography',
    body: 'See where the biblical story unfolded and jump between locations, journeys, and the passages tied to them.',
  },
  {
    icon: Book,
    title: 'Lexicon & Word Study',
    body: 'Understand old English words with historical context, modern equivalents, and curated theological meanings.',
  },
  {
    icon: StickyNote,
    title: 'Notes, Bookmarks & Shareable Links',
    body: 'Save verses, write personal notes, and copy deep links that restore your exact study context.',
  },
]

export default function Landing({
  onLogin,
  theme,
  onToggleTheme,
  onYouVersionLogin,
}: {
  onLogin: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onYouVersionLogin?: () => void | Promise<void>
}) {
  const brandingVersion = '20260803g'
  const backdropLogo = theme === 'dark'
    ? `/branding/tan/logo-512.png?v=${brandingVersion}`
    : `/branding/green/logo-512.png?v=${brandingVersion}`

  return (
    <div className="landing">
      <div className="landing-backdrop" aria-hidden="true">
        <img src={backdropLogo} alt="" className="landing-backdrop-logo" draggable="false" />
      </div>
      <header className="landing-header">
        <img
          src={theme === 'dark' ? `/branding/tan/wordmark-192.png?v=${brandingVersion}` : `/branding/green/wordmark-192.png?v=${brandingVersion}`}
          alt="Rooted in Christ"
          className="landing-logo"
        />
        <div className="landing-header-actions">
          <button
            className="secondary landing-theme-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="landing-login-btn" onClick={onLogin}>
            <LogIn size={16} /> Log In
          </button>
          {onYouVersionLogin ? (
            <button className="landing-login-btn" onClick={() => void onYouVersionLogin()}>
              <LogIn size={16} /> Sign in with YouVersion
            </button>
          ) : null}
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Study Scripture with clarity, depth, and visual insight</p>
            <h1>Colossians 2:6–7</h1>
            <blockquote className="landing-passage">
              <p>
                “As ye have therefore received Christ Jesus the Lord, so walk ye in him: Rooted and built up in him,
                and stablished in the faith, as ye have been taught, abounding therein with thanksgiving.”
              </p>
              <footer>Colossians 2:6–7</footer>
            </blockquote>
            <p className="landing-hero-summary">
              A unified Bible research engine: search, parallel translations, interactive maps, relational networks,
              timelines, notes, and bookmarks in one web-native workspace. Move from a verse to its geography, its
              cross-references, and the people in its story without leaving the passage.
            </p>
            <div className="landing-hero-actions">
              <button className="landing-cta" onClick={onLogin}>
                <LogIn size={18} /> Enter the Study <ArrowRight size={18} />
              </button>
            </div>
            <div className="landing-trust-line">
              <ShieldCheck size={16} /> Built for focused Bible study
            </div>
            <div className="landing-badges" aria-label="Core study strengths">
              <span>Fast search</span>
              <span>Visual context</span>
              <span>Notes &amp; bookmarks</span>
            </div>
          </div>

          <div className="landing-hero-aside">
            <article className="landing-callout-card landing-callout-card-primary">
              <span className="landing-callout-kicker">One study flow</span>
              <h2>Stay in the passage from first search to final note.</h2>
              <p>
                The app keeps Scripture, maps, and study tools together so the page feels calm, intentional, and easy to
                return to.
              </p>
            </article>
            <div className="landing-callout-grid">
              <article className="landing-mini-card">
                <Search size={18} />
                <strong>Find it fast</strong>
                <p>Search by topic, phrase, or verse.</p>
              </article>
              <article className="landing-mini-card">
                <MapIcon size={18} />
                <strong>See context</strong>
                <p>Trace geography and cross references.</p>
              </article>
              <article className="landing-mini-card">
                <StickyNote size={18} />
                <strong>Keep insight</strong>
                <p>Capture notes and bookmarks as you study.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-section landing-tools">
          <div className="landing-section-heading">
            <span className="landing-section-kicker">Study toolkit</span>
            <h2>The full set of tools for deeper Bible study</h2>
            <p>Search, reader, maps, lexicon, notes, and bookmarks all work together from one place.</p>
          </div>
          <div className="landing-feature-grid">
            {FEATURES.map((feature, index) => (
              <article className="landing-feature-card" key={feature.title} style={{ animationDelay: `${index * 90}ms` }}>
                <feature.icon size={26} className="landing-feature-icon" />
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <section className="landing-section landing-provenance">
        <div className="landing-section-heading">
          <span className="landing-section-kicker">Data & Licensing</span>
          <h2>Open and responsibly sourced</h2>
          <p>
            Scripture text, place data, character timelines, and cross-reference graphs are drawn from public-domain or
            openly licensed sources. We respect publisher copyrights and do not redistribute restricted translations.
          </p>
        </div>
        <div className="landing-provenance-grid">
          <article className="landing-provenance-card">
            <h3>Scripture Text</h3>
            <p>
              The default corpus uses the King James Version (KJV), which is in the public domain in the United States.
              Parallel translations are streamed through the YouVersion Platform API under their publisher terms and are
              not stored on our servers.
            </p>
          </article>
          <article className="landing-provenance-card">
            <h3>Geography & Figures</h3>
            <p>
              Place coordinates, character events, and approximate dates are curated from open biblical datasets and
              mainstream scholarly estimates. Chronological ranges represent common scholarly views, not a single
              authoritative position.
            </p>
          </article>
          <article className="landing-provenance-card">
            <h3>Lexicon</h3>
            <p>
              Word-study entries combine public-domain lexical resources with curated theological summaries. They are
              provided for study context and are not a replacement for formal original-language scholarship.
            </p>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-copy">
          <span>Rooted in Christ &copy; {new Date().getFullYear()}</span>
          <span>KJV text is in the public domain. YouVersion translations are subject to publisher licensing.</span>
        </div>
      </footer>
    </div>
  )
}
