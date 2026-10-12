import { useEffect, useState } from 'react'

export default function BuildingEditor({
  building,
  poiList,
  onSave,
  onClose,
}) {
  const [name, setName] = useState(building.name)
  const [units, setUnits] = useState(building.units)
  const [status, setStatus] = useState(building.status)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setName(building.name)
    setUnits(building.units)
    setStatus(building.status)
    setSearch('')
  }, [building.id])

  const normalize = (text) =>
    String(text || '').toLocaleLowerCase('tr-TR')

  const results = search.trim()
    ? poiList.filter((poi) => {
        const matches = normalize(poi.name).includes(normalize(search))
        const alreadyAdded = units.some(
          (unit) => unit.name === poi.name
        )
        return matches && !alreadyAdded
      }).slice(0, 8)
    : []

  function addUnit(poi) {
    setUnits((previous) => [...previous, poi])
    setSearch('')
  }

  function removeUnit(index) {
    setUnits((previous) =>
      previous.filter((_, currentIndex) => currentIndex !== index)
    )
  }

  function save(event) {
    event.preventDefault()

    onSave(building.id, {
      name: name.trim() || 'İsimsiz bina',
      units,
      status,
    })
  }

  return (
    <section className="editor-panel" aria-label="Bina düzenleme paneli">
      <div className="editor-heading">
        <div>
          <span className="editor-eyebrow">BİNA DÜZENLEYİCİ</span>
          <h2>Bina bilgileri</h2>
        </div>

        <button
          type="button"
          className="editor-close"
          onClick={onClose}
          aria-label="Paneli kapat"
        >
          ×
        </button>
      </div>

      <div className="editor-original">
        <strong>OpenStreetMap adı</strong>
        <span>{building.osmName || 'Belirtilmemiş'}</span>
      </div>

      <form onSubmit={save}>
        <label className="editor-label" htmlFor="building-name">
          Görünen bina adı
        </label>

        <input
          id="building-name"
          className="editor-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <label className="editor-label" htmlFor="review-status">
          Doğrulama durumu
        </label>

        <select
          id="review-status"
          className="editor-input"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="unreviewed">⚪ İncelenmedi</option>
          <option value="uncertain">🟡 Şüpheli</option>
          <option value="verified">🟢 Doğrulandı</option>
        </select>

        <label className="editor-label">
          Binayla ilişkilendirilen birimler
        </label>

        <div className="editor-units">
          {units.length === 0 && (
            <p className="editor-empty">Henüz birim eklenmemiş.</p>
          )}

          {units.map((unit, index) => (
            <div className="editor-unit" key={`${unit.name}-${index}`}>
              <div>
                <strong>{unit.name}</strong>
                <small>{unit.category}</small>
              </div>

              <button
                type="button"
                onClick={() => removeUnit(index)}
                aria-label={`${unit.name} birimini kaldır`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <label className="editor-label" htmlFor="poi-search">
          Marmara verilerinden birim ekle
        </label>

        <input
          id="poi-search"
          className="editor-input"
          placeholder="Örneğin: Hukuk Fakültesi"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {search.trim() && (
          <div className="editor-search-results">
            {results.length ? (
              results.map((poi, index) => (
                <button
                  key={`${poi.name}-${index}`}
                  type="button"
                  onClick={() => addUnit(poi)}
                >
                  <span>
                    <strong>{poi.name}</strong>
                    <small>{poi.category}</small>
                  </span>
                  <span>＋</span>
                </button>
              ))
            ) : (
              <p className="editor-empty">Sonuç bulunamadı.</p>
            )}
          </div>
        )}

        <button className="editor-save" type="submit">
          Değişiklikleri kaydet
        </button>
      </form>
    </section>
  )
}