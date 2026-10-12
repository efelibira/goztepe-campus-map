import { useMemo, useRef, useState } from 'react'
import { usePanelPresence } from './usePanelPresence'

function normalize(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export default function SearchPanel({
  buildings,
  onSelect,
  loading,
  animationsEnabled = true,
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const term = normalize(query)
    if (!term) return []

    return buildings
      .map((building) => {
        const nameMatch = normalize(building.name).includes(term)

        const matchingUnits = building.units.filter((unit) =>
          normalize(unit.name).includes(term)
        )

        if (!nameMatch && matchingUnits.length === 0) return null

        return {
          ...building,
          matchingUnits,
          nameMatch,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.nameMatch !== b.nameMatch) {
          return a.nameMatch ? -1 : 1
        }

        return a.name.localeCompare(b.name, 'tr')
      })
      .slice(0, 8)
  }, [buildings, query])

  const showResults = open && Boolean(query.trim())
  const { presented: resultsMounted, exiting: resultsExiting } =
    usePanelPresence(showResults, 140, animationsEnabled)
  const lastResults = useRef([])
  if (showResults) lastResults.current = results
  const visibleResults = showResults ? results : lastResults.current

  function choose(building) {
    onSelect(building.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <section className="campus-search" aria-label="Kampüste ara">
      <div className="campus-search-input-wrap">
        <span className="campus-search-icon" aria-hidden="true">
          ⌕
        </span>

        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              event.currentTarget.blur()
            }

            if (event.key === 'Enter' && results.length > 0) {
              choose(results[0])
            }
          }}
          placeholder={
            loading ? 'Binalar yükleniyor...' : 'Bina veya birim ara...'
          }
          disabled={loading}
          aria-label="Bina veya birim ara"
          aria-expanded={open && query.trim().length > 0}
        />
      </div>

      {resultsMounted && (
        <div
          className="campus-search-results"
          data-motion={animationsEnabled ? (resultsExiting ? 'exit' : 'enter') : 'off'}
          aria-hidden={resultsExiting}
          inert={resultsExiting ? true : undefined}
        >
          {visibleResults.length > 0 ? (
            visibleResults.map((building) => (
              <button
                key={building.id}
                type="button"
                className="campus-search-result"
                onClick={() => choose(building)}
              >
                <span className="campus-search-result-name">
                  {building.name}
                </span>

                {building.matchingUnits.length > 0 && (
                  <span className="campus-search-result-detail">
                    {building.matchingUnits
                      .slice(0, 2)
                      .map((unit) => unit.name)
                      .join(' · ')}
                  </span>
                )}

                <span className="campus-search-result-action">
                  Haritada göster ↗
                </span>
              </button>
            ))
          ) : (
            <div className="campus-search-empty">
              Eşleşen bina bulunamadı.
            </div>
          )}
        </div>
      )}
    </section>
  )
}