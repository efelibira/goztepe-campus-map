# Yapay zekâ ve katkıcı devir notları

## Çalışma ilkeleri

1. Önce `git status --short --branch`, son commit ve etkin dalı kontrol edin. Bu depo dışında çalışan bir dizini Git kökü sanmayın.
2. 2D harita kullanıcı açısından korunması gereken ana deneyimdir. 3D denemeleri `feature/3d-campus` dalında tutun; `main` dalına geçmeden önce değişiklikleri gözden geçirin.
3. Kullanıcı tarafından bırakılmış `.bak`, `backup` ve izlenmeyen dosyaları incelemeden silmeyin veya üzerine yazmayın.
4. Bina geometrisi ve kimliklerinde mümkün olduğunca OSM `@id` değerini koruyun. Bu kimlikler düzeltme kayıtları, seçim ve arama için bağlantı noktasıdır.
5. Kaynak veriyi, üretilmiş veriden ayırın. Üretilen GeoJSON'u elle düzenlemek yerine ilgili kaynak/veri akışını güncelleyin ve üretim betiğini çalıştırın.
6. Bina adlarını ve Marmara birim eşleşmelerini otomatik geometri kesişiminden gelen kesin gerçekler gibi göstermeyin; denetim durumu ve kaynak bilgisi önemlidir.
7. Kullanıcı açıkça istemedikçe veri indirme, dosya silme, dalı birleştirme veya uzak depoya gönderme yapmayın.

## Mimari kısa özeti

React uygulaması `src/main.jsx` üzerinden `src/App.jsx`'i başlatır. `App.jsx`, MapLibre GL haritasını kurar ve GeoJSON kaynaklarını yükler. Kampüs binaları `campus-buildings` kaynağındadır; kaynakta `promoteId: buildingKey` kullanılır. Harita katmanları bina seçimi, düzenleme durumu ve etiketlerle birlikte çalışır. Bina düzeltmeleri önce `public/data/building-overrides.json` içinden, sonra tarayıcı `localStorage` kaydından birleştirilir. Tarayıcıdaki değişiklikler dışa aktarılabilir; bunlar kendiliğinden depodaki JSON'a yazılmaz.

Yürüme ağı `goztepe-walkways.geojson` içindeki LineString geometrilerinden oluşturulur. `src/routeEngine.js`, A Kapısı ile hedef bina arasında A* kullanır. Başlangıç/hedef bina bağlantıları en yakın yol düğümüne göre yaklaşık çizildiği için rota prototip niteliğindedir.

## Veri dosyaları

- `goztepe-buildings-raw.geojson`: 829 OSM bina geometrisi; kampüs ve çevre binaları.
- `goztepe-boundary.geojson`: kampüs sınırı.
- `goztepe-buildings-matched.geojson`: sınır içinde seçilen 58 bina ve otomatik Marmara POI eşleşmeleri.
- `goztepe-buildings-3d.geojson`: eşleştirilmiş binaların 3D gösterim türevi.
- `goztepe-surroundings.geojson`: kampüs çevresindeki binalar.
- `goztepe-poi.geojson`: 114 Marmara/POI konumu.
- `goztepe-poi-unmatched.geojson`: bina poligonuyla otomatik eşleşmeyen kampüs POI'leri.
- `goztepe-walkways.geojson`: 631 yürüme yolu geometrisi.
- `building-overrides.json`: yayınlanan bina adı, birim ve doğrulama düzeltmeleri.
- `reports/building-audit.csv`: elle doğrulama için rapor.

Sayılar veri değiştikçe değişebilir; güncel sayıları dosyadan yeniden hesaplayın.

## 3D yükseklik güveni

`goztepe-buildings-3d.geojson` içindeki `heightSource` değeri:

- `osm-levels`: OSM `building:levels` değerinden yaklaşık 3 metre/kat varsayımıyla türetildi.
- `placeholder`: kat bilgisi yoktu; mevcut betik 12 metre geçici değer atıyor.

Mevcut veri denetiminde 58 binanın 8'inde kat bilgisi, 50'sinde geçici yükseklik vardı. Bu nedenle maket şu an ölçekli/ölçülmüş bir bina modeli değildir. Yeni bina yüksekliği verisi eklenirken kaynak, doğrulama durumu ve tahmin/ölçüm ayrımı korunmalıdır. `scripts/prepare-3d.mjs` tekrar çalıştırılırsa 3D GeoJSON yeniden üretilir.

## Bağımlılıklar ve komutlar

`package.json` temel bağımlılıkları: React 19, MapLibre GL 6, Turf centroid ve boolean point-in-polygon; geliştirme araçları Vite 8 ve Oxlint. Paket sürümlerinin kesin kilidi `package-lock.json` içindedir.

- `npm run dev`: geliştirme sunucusu
- `npm run build`: Vite üretim derlemesi
- `npm run lint`: Oxlint
- `npm run preview`: üretim çıktısını önizleme
- `node scripts/match-buildings.mjs`: eşleştirilmiş bina/POI verisini oluşturur.
- `node scripts/prepare-3d.mjs`: 3D bina türevini oluşturur.
- `node scripts/audit-buildings.mjs`: bina denetim CSV'sini oluşturur.

Veri üretim betikleri hedef dosyaların üzerine yazar. Çalıştırmadan önce Git durumunu kontrol edin ve üretilecek dosyaların mevcut kullanıcı değişikliklerini içerip içermediğini inceleyin.

## 3D prototip değerlendirme listesi

- 2D görünüm erişilebilir ve anlaşılır kalıyor mu?
- 3D görünümde kamera, bina tabanları ve yükseklikler anlaşılır mı?
- `placeholder` yüksekliği olan binalar açıkça ayırt ediliyor mu?
- Bina seçimi, arama, etiket, düzenleme paneli ve rota çalışmaya devam ediyor mu?
- Mobil görünüm ve harita performansı kabul edilebilir mi?
- Yeni veri ya da katman kimlikleri mevcut OSM bina kimlikleriyle tutarlı mı?
