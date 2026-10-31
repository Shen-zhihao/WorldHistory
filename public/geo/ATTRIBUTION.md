# Geographic data

- `countries-110m.json`: World Atlas 2.0.2 by Mike Bostock / Observable, https://github.com/topojson/world-atlas, ISC license. Retrieved from https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json on 2026-10-31. Based on Natural Earth 1:110m public-domain cartography (https://www.naturalearthdata.com/about/terms-of-use/).
- Country reference names / ISO identifiers / representative coordinates in `src/lib/countries.ts`: https://github.com/mledoze/countries (ODbL-1.0), downloaded 2026-10-31. Chinese region names are localized with Unicode CLDR through Intl.DisplayNames.
- Geography represents present-day reference borders for navigation only, not territorial boundaries at the selected historical date. Country matching is heuristic and may require editorial correction. Tiny states not present in the simplified topology remain available through the country selector.
- Globe textures, grid, glow, pins, and stars are generated locally in the browser; no external tile servers or high-resolution image textures are requested.
