# Historical globe borders

Source: **André Ourednik and historical-basemaps contributors**, [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps).

Pinned source revision: [`da7a4b735ecef70aebdc9c73e409d8a2500d50f3`](https://github.com/aourednik/historical-basemaps/tree/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson), downloaded 2026-10-31.

The original GeoJSON and the adapted geometry in this directory are licensed under **GNU GPL version 3**; the full license is retained in [LICENSE](./LICENSE). The conversion source is [prepare.py](./prepare.py). The upstream URLs in the application manifest identify the full original source for each adapted map. Attribution does not imply endorsement by the original authors.

Included real snapshots: **1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010**. No intermediate borders have been invented or interpolated. A selected year uses the latest available earlier snapshot and displays the actual snapshot year. Years after 2010 continue using the 2010 historical snapshot; the contemporary layer is a separate dataset.

Adaptations: the source features and polygon/multipolygon identities are preserved; rings are simplified using Douglas–Peucker with a 0.12-degree tolerance and rounded to three coordinate decimals. Properties are reduced to historical name, governing/associated entity, source border precision, and an optional modern-country association for unambiguous names. Modern association is a search aid, not an assertion that historical borders were today's borders. Multi-successor empires such as the Ottoman Empire, Soviet Union, Austria-Hungary and Prussia are deliberately not assigned a single modern ISO country.

The source is a community reconstruction and work in progress. Approximate, overlapping and disputed areas exist. The data do not support exact month-by-month historical boundary claims or academic-grade boundary measurement. Source `BORDERPRECISION` values are retained as `precision`, where available.
