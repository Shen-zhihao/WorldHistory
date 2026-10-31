/** Real historical snapshots. Intervening years intentionally use the most recent earlier snapshot. */
export interface MapEra { year: number; label: string; file: string; source: string; license: string }

export const mapEras: MapEra[] = [
  {
    "year": 1800,
    "label": "1800 年疆界快照",
    "file": "/geo/history/world_1800.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1800.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1815,
    "label": "1815 年疆界快照",
    "file": "/geo/history/world_1815.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1815.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1878,
    "label": "1878 年疆界快照",
    "file": "/geo/history/world_1878.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1878.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1880,
    "label": "1880 年疆界快照",
    "file": "/geo/history/world_1880.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1880.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1900,
    "label": "1900 年疆界快照",
    "file": "/geo/history/world_1900.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1900.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1914,
    "label": "1914 年疆界快照",
    "file": "/geo/history/world_1914.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1914.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1920,
    "label": "1920 年疆界快照",
    "file": "/geo/history/world_1920.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1920.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1930,
    "label": "1930 年疆界快照",
    "file": "/geo/history/world_1930.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1930.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1938,
    "label": "1938 年疆界快照",
    "file": "/geo/history/world_1938.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1938.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1945,
    "label": "1945 年疆界快照",
    "file": "/geo/history/world_1945.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1945.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1960,
    "label": "1960 年疆界快照",
    "file": "/geo/history/world_1960.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1960.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 1994,
    "label": "1994 年疆界快照",
    "file": "/geo/history/world_1994.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_1994.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 2000,
    "label": "2000 年疆界快照",
    "file": "/geo/history/world_2000.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_2000.geojson",
    "license": "GPL-3.0"
  },
  {
    "year": 2010,
    "label": "2010 年疆界快照",
    "file": "/geo/history/world_2010.geojson.gz",
    "source": "https://github.com/aourednik/historical-basemaps/blob/da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/world_2010.geojson",
    "license": "GPL-3.0"
  }
];

export function getMapEra(year: number): MapEra {
  return [...mapEras].reverse().find(era => era.year <= year) || mapEras[0];
}
