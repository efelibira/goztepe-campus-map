# Göztepe Kampüs Haritası

Marmara Üniversitesi Göztepe Kampüsü için React ve MapLibre GL tabanlı etkileşimli harita. Uygulama; kampüs binalarını, Marmara Üniversitesi konum verileriyle eşleşmelerini, aramayı, bina bilgilerini ve yürüme rotalarını gösterir. `feature/3d-campus` dalında 3D kampüs maketi üzerinde çalışılır; `main` dalı ayrı tutulur.

## Gereksinimler ve çalıştırma

- Node.js ve npm
- Harita taban stilini ve Google Fonts'u yüklemek için internet bağlantısı

```sh
npm install
npm run dev
```

Üretim çıktısı için `npm run build`, yerel önizleme için `npm run preview`, statik kod denetimi için `npm run lint` kullanılabilir.

## Proje yapısı

- `src/App.jsx`: MapLibre haritası, GeoJSON yükleme, bina seçimi, arama/düzenleme bağlantıları ve rota etkileşimi.
- `src/BuildingEditor.jsx`, `src/SearchPanel.jsx`: bina düzenleme ve arama panelleri.
- `src/routeEngine.js`: yürüme ağı üzerinde A* rota hesabı. Bina giriş bağlantıları yaklaşık kabul edilir.
- `src/campusStyle.js`, `src/buildingLabels.js`, `src/mapCamera.js`: harita görünümü, etiketler ve kamera ayarları.
- `public/data/`: kampüs sınırı, ham/eşleştirilmiş binalar, 3D binalar, çevre, POI'ler, yürüyüş yolları ve yayınlanan düzeltmeler.
- `scripts/`: OSM/Marmara verilerini eşleştirme, 3D yükseklik atama ve denetim raporu üretme.
- `reports/building-audit.csv`: bina eşleşmelerinin elle incelenmesi için rapor.
- `docs/AI_HANDOFF.md`: yeni katkıcılar ve farklı yapay zekâlarla devam etmek için çalışma notları.

## Veri akışı

`goztepe-buildings-raw.geojson` ham OSM bina geometrilerini içerir. `goztepe-boundary.geojson` kampüs sınırıdır. `scripts/match-buildings.mjs`, sınır içindeki binaları ve POI'leri eşleştirerek `goztepe-buildings-matched.geojson` üretir. `scripts/prepare-3d.mjs`, eşleştirilmiş binalara `displayHeight` ve `heightSource` ekleyerek `goztepe-buildings-3d.geojson` üretir. Çevre binaları, POI'ler ve yürüyüş yolları ayrı veri kaynaklarıdır.

3D yüksekliklerin bir kısmı OSM kat bilgisinden türetilmiştir; geri kalanı geçici tahmindir. Bu tahminleri gerçek ölçüm gibi sunmayın. Ayrıntılar ve güven düzeyi için [AI çalışma rehberine](docs/AI_HANDOFF.md) bakın.

## Dallar

- `main`: 2D haritanın korunacağı ana geliştirme hattı.
- `feature/3d-campus`: 3D maket ve karşılaştırmalı görünüm çalışmaları.

3D çalışmasını ana dala taşımadan önce 2D görünümün, bina arama/seçiminin, düzenleme akışının ve rotaların çalıştığını doğrulayın. Yedek ve `.bak` dosyaları kullanıcıya ait kurtarma noktaları olabilir; sahibine danışmadan silmeyin.
