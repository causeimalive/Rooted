import { ExternalLink, Loader2 } from 'lucide-react'
import { useWikiSummary, getWikipediaLink } from './wikipedia'
import { bibleGatewayLink, formatPassage } from './places'
import type { PassageMatch } from './types'
import { useI18n } from './i18n'

export default function WikiMediaCard({
  id,
  title,
  passages,
}: {
  id: string
  title: string
  passages?: PassageMatch[]
}) {
  const { t } = useI18n()
  const { loading, data } = useWikiSummary(id, title)
  const wikiLink = data?.pageUrl ?? getWikipediaLink(id, title)

  return (
    <div className="map-list-card wiki-media-card">
      <h4>{t('historyAndMedia')}</h4>

      {loading && (
        <div className="wiki-loading">
          <Loader2 className="spin" size={16} /> {t('loading')}
        </div>
      )}

      {!loading && data?.thumbnailUrl && (
        <img className="wiki-thumb" src={data.thumbnailUrl} alt={title} loading="lazy" />
      )}

      {!loading && data?.extract && <p className="wiki-extract">{data.extract}</p>}

      {!loading && !data && <p className="wiki-extract wiki-extract-empty">{t('noHistoryFound')}</p>}

      <div className="wiki-links">
        <a className="wiki-link" href={wikiLink} target="_blank" rel="noreferrer">
          <ExternalLink size={12} /> {t('readOnWikipedia')}
        </a>
        {passages?.map((passage, i) => (
          <a key={i} className="wiki-link" href={bibleGatewayLink(passage)} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> {formatPassage(passage)} · {t('bibleGateway')}
          </a>
        ))}
      </div>
    </div>
  )
}
