/**
 * Screenshot-only spec — not part of the CI suite.
 * Run manually after UI changes:
 *
 *   cd packages/frontend
 *   pnpm exec playwright test e2e/screenshot-content.spec.ts --project chromium
 *
 * Produces three screenshots in docs/images/readme/.
 * All data is fictional — no real artists, albums, or cover images.
 * Cover art is rendered as abstract SVG gradients.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, type Page, type Route } from '@playwright/test'

const DOCS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/images/readme',
)

// ── SVG cover art ────────────────────────────────────────────────────────────
// Album covers (300×300) and artist avatars (300×300) use http://cover.local/…
// Two interception paths:
//   1. proxyCoverArtUrl() converts http:// → /api/playback/cover?src=… (album covers, artist avatars)
//   2. Direct http://cover.local/** route (hero background image — not proxied by the app)

const COVERS: Record<string, string> = {
  // Now-playing album cover — dark indigo/violet with concentric rings
  'lowlight-city': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f0524"/>
        <stop offset="50%" stop-color="#1e0d4a"/>
        <stop offset="100%" stop-color="#0a1560"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <circle cx="150" cy="135" r="90" fill="none" stroke="#5b21b6" stroke-width="1" opacity="0.5"/>
    <circle cx="150" cy="135" r="55" fill="none" stroke="#7c3aed" stroke-width="0.8" opacity="0.4"/>
    <ellipse cx="150" cy="250" rx="130" ry="30" fill="#4c1d95" opacity="0.25"/>
  </svg>`,

  // Album cover — night city skyline in teal/cyan
  'neon-harbor': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#041e2e"/>
        <stop offset="55%" stop-color="#073d5e"/>
        <stop offset="100%" stop-color="#065f7a"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <line x1="0" y1="200" x2="300" y2="200" stroke="#00b4d8" stroke-width="0.6" opacity="0.4"/>
    <line x1="0" y1="210" x2="300" y2="210" stroke="#0096c7" stroke-width="0.4" opacity="0.3"/>
    <line x1="0" y1="220" x2="300" y2="220" stroke="#00b4d8" stroke-width="0.6" opacity="0.25"/>
    <rect x="60"  y="100" width="12" height="100" fill="#90e0ef" opacity="0.15"/>
    <rect x="90"  y="70"  width="12" height="130" fill="#90e0ef" opacity="0.1"/>
    <rect x="130" y="90"  width="12" height="110" fill="#90e0ef" opacity="0.12"/>
    <rect x="170" y="60"  width="12" height="140" fill="#90e0ef" opacity="0.1"/>
    <rect x="210" y="80"  width="12" height="120" fill="#90e0ef" opacity="0.13"/>
  </svg>`,

  // Album cover — pink/purple sunset radial
  'glass-horizon': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <defs>
      <radialGradient id="g" cx="50%" cy="65%" r="70%">
        <stop offset="0%" stop-color="#f472b6"/>
        <stop offset="45%" stop-color="#a855f7"/>
        <stop offset="100%" stop-color="#1e1b4b"/>
      </radialGradient>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <line x1="0" y1="195" x2="300" y2="195" stroke="#f9a8d4" stroke-width="0.8" opacity="0.4"/>
    <circle cx="150" cy="195" r="45" fill="none" stroke="#e879f9" stroke-width="0.6" opacity="0.35"/>
  </svg>`,

  // Album cover — dark green with wave lines
  'tidal-lines': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <defs>
      <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stop-color="#052e16"/>
        <stop offset="50%" stop-color="#14532d"/>
        <stop offset="100%" stop-color="#166534"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <path d="M0,160 Q75,140 150,160 Q225,180 300,160" fill="none" stroke="#4ade80" stroke-width="0.7" opacity="0.35"/>
    <path d="M0,175 Q75,155 150,175 Q225,195 300,175" fill="none" stroke="#4ade80" stroke-width="0.5" opacity="0.25"/>
    <path d="M0,190 Q75,170 150,190 Q225,210 300,190" fill="none" stroke="#4ade80" stroke-width="0.5" opacity="0.2"/>
  </svg>`,

  // Hero/fanart banner (wide atmospheric) — dark stage lighting, warm amber spotlight
  'hero-mara-voss': `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="400">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0c0a1e"/>
        <stop offset="100%" stop-color="#1a0a2e"/>
      </linearGradient>
      <radialGradient id="spot1" cx="38%" cy="100%" r="55%">
        <stop offset="0%" stop-color="#d97706" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="spot2" cx="62%" cy="100%" r="45%">
        <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="80%" r="30%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="400" fill="url(#sky)"/>
    <rect width="1280" height="400" fill="url(#spot1)"/>
    <rect width="1280" height="400" fill="url(#spot2)"/>
    <rect width="1280" height="400" fill="url(#glow)"/>
    <!-- subtle horizontal scan lines -->
    <rect x="0" y="0" width="1280" height="1" fill="#ffffff" opacity="0.02"/>
    <rect x="0" y="4" width="1280" height="1" fill="#ffffff" opacity="0.015"/>
    <rect x="0" y="8" width="1280" height="1" fill="#ffffff" opacity="0.01"/>
  </svg>`,

  // Artist avatars — bright, saturated gradients that read clearly at 44×44 px thumbnail size
  'artist-nova-vale': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#0284c7"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" fill="url(#g)"/>
    <circle cx="60" cy="55" r="30" fill="#bae6fd" opacity="0.25"/>
    <circle cx="60" cy="55" r="15" fill="#f0f9ff" opacity="0.3"/>
  </svg>`,

  'artist-kite-harbor': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#34d399"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" fill="url(#g)"/>
    <path d="M15,95 Q60,20 105,95" fill="#d1fae5" opacity="0.3"/>
  </svg>`,

  'artist-the-lanterns': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <defs>
      <radialGradient id="g" cx="50%" cy="45%" r="65%">
        <stop offset="0%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#b45309"/>
      </radialGradient>
    </defs>
    <rect width="120" height="120" fill="url(#g)"/>
    <circle cx="60" cy="50" r="22" fill="#fef3c7" opacity="0.4"/>
    <circle cx="60" cy="50" r="10" fill="#fffbeb" opacity="0.5"/>
  </svg>`,

  'artist-mira-north': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <defs>
      <radialGradient id="g" cx="50%" cy="45%" r="70%">
        <stop offset="0%" stop-color="#f472b6"/>
        <stop offset="100%" stop-color="#be185d"/>
      </radialGradient>
    </defs>
    <rect width="120" height="120" fill="url(#g)"/>
    <circle cx="60" cy="55" r="28" fill="#fce7f3" opacity="0.3"/>
    <circle cx="60" cy="55" r="12" fill="#fdf2f8" opacity="0.4"/>
  </svg>`,

  'artist-static-bloom': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#a78bfa"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" fill="url(#g)"/>
    <circle cx="60" cy="55" r="28" fill="#ede9fe" opacity="0.25"/>
    <circle cx="60" cy="55" r="12" fill="#f5f3ff" opacity="0.35"/>
  </svg>`,
}

const svgResponse = async (route: Route, key: string): Promise<void> => {
  const svg = COVERS[key] ?? COVERS['lowlight-city']!
  await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
}

// ── Fictional artist universe ────────────────────────────────────────────────

const cover = (name: string): string => `http://cover.local/${name}`

const PLAYING = {
  id: 'track-afterglow',
  title: 'Afterglow Signals',
  artist: 'Nova Vale',
  album: 'Lowlight City',
  url: 'file:///music/afterglow-signals.flac',
  duration: 223,
  source: 'local',
  coverArtUrl: cover('lowlight-city'),
}

const PLAYBACK_STATUS = {
  status: 'paused',
  currentTime: 91.5,
  currentTrack: PLAYING,
  queuePreview: [
    { id: 'q1', title: 'City of Dust', artist: 'Mira North' },
    { id: 'q2', title: 'Neon Tides', artist: 'Static Bloom' },
    { id: 'q3', title: 'Distant Lights', artist: 'The Lanterns' },
  ],
}

const AUTOCOMPLETE = {
  suggestions: [
    { id: 'a1', type: 'artist', artist: 'Nova Vale', artistId: 'a-nova-vale', albumCover: cover('artist-nova-vale') },
    { id: 'a2', type: 'artist', artist: 'Kite Harbor', artistId: 'a-kite-harbor', albumCover: cover('artist-kite-harbor') },
    { id: 'a3', type: 'artist', artist: 'The Lanterns', artistId: 'a-the-lanterns', albumCover: cover('artist-the-lanterns') },
    { id: 'a4', type: 'artist', artist: 'Mira North', artistId: 'a-mira-north', albumCover: cover('artist-mira-north') },
    { id: 'a5', type: 'artist', artist: 'Static Bloom', artistId: 'a-static-bloom', albumCover: cover('artist-static-bloom') },
  ],
  query: 'nova',
}

const SEARCH_RESULTS = {
  tracks: [
    {
      id: 't1',
      title: 'Glass Harbor',
      artist: 'Kite Harbor',
      album: 'Tidal Lines',
      url: 'file:///music/glass-harbor.flac',
      source: 'local',
    },
    {
      id: 't2',
      title: 'Night Transit',
      artist: 'Kite Harbor',
      album: 'Tidal Lines',
      url: 'file:///music/night-transit.flac',
      source: 'local',
    },
    {
      id: 't3',
      title: 'Faint Echoes',
      artist: 'Paper Skies',
      album: 'Paper Skies',
      url: 'file:///music/faint-echoes.flac',
      source: 'local',
    },
  ],
  albums: [],
  artists: [
    { name: 'Nova Vale', artistId: 'a-nova-vale', coverArtUrl: cover('artist-nova-vale') },
    { name: 'Kite Harbor', artistId: 'a-kite-harbor', coverArtUrl: cover('artist-kite-harbor') },
    { name: 'The Lanterns', artistId: 'a-the-lanterns', coverArtUrl: cover('artist-the-lanterns') },
    { name: 'Mira North', artistId: 'a-mira-north', coverArtUrl: cover('artist-mira-north') },
    { name: 'Static Bloom', artistId: 'a-static-bloom', coverArtUrl: cover('artist-static-bloom') },
  ],
  query: 'nova',
  totalResults: 8,
}

const MARA_VOSS_ENRICHMENT = {
  name: 'Mara Voss',
  listeners: 842190,
  playcount: 41382004,
  tags: ['synthpop', 'electronic', 'indie pop', 'live act', 'berlin'],
  bio: 'Mara Voss is a Berlin-based electronic pop songwriter and producer. Her music blends shimmering synths with honest lyrics and cinematic soundscapes. Known for her collaborative live shows, she creates immersive experiences that connect people on and off the dancefloor.',
}

const MARA_VOSS_ALBUMS = {
  localAlbums: [
    {
      id: 'album-neon-harbor',
      albumId: '101',
      title: 'Neon Harbor',
      artist: 'Mara Voss',
      source: 'local',
      trackCount: 10,
      coverArtUrl: cover('neon-harbor'),
    },
  ],
  tidalAlbums: [
    {
      id: 'tidal::mara-voss::neon-harbor',
      title: 'Neon Harbor',
      artist: 'Mara Voss',
      source: 'tidal',
      trackCount: 10,
      trackUrls: [],
      coverArtUrl: cover('neon-harbor'),
    },
    {
      id: 'tidal::mara-voss::glass-horizon',
      title: 'Glass Horizon',
      artist: 'Mara Voss',
      source: 'tidal',
      trackCount: 8,
      trackUrls: [],
      coverArtUrl: cover('glass-horizon'),
    },
  ],
}

const MARA_VOSS_TOP_TRACKS = {
  artist: 'Mara Voss',
  tracks: [
    {
      id: 'lt1',
      title: 'Signal Fire',
      artist: 'Mara Voss',
      album: 'Neon Harbor',
      url: 'file:///music/signal-fire.flac',
      source: 'local',
      playcount: 4210000,
      listeners: 380000,
      rank: 1,
      coverArtUrl: cover('neon-harbor'),
    },
    {
      id: 'lt2',
      title: 'Coastal Drive',
      artist: 'Mara Voss',
      album: 'Neon Harbor',
      url: 'file:///music/coastal-drive.flac',
      source: 'local',
      playcount: 3870000,
      listeners: 341000,
      rank: 2,
      coverArtUrl: cover('neon-harbor'),
    },
    {
      id: 'lt3',
      title: 'Glass Horizon',
      artist: 'Mara Voss',
      album: 'Glass Horizon',
      url: '',
      source: 'unknown',
      playcount: 3100000,
      listeners: 290000,
      rank: 3,
      coverArtUrl: cover('glass-horizon'),
    },
    {
      id: 'lt4',
      title: 'Lowlight Echo',
      artist: 'Mara Voss',
      album: 'Glass Horizon',
      url: '',
      source: 'unknown',
      playcount: 2700000,
      listeners: 250000,
      rank: 4,
      coverArtUrl: cover('glass-horizon'),
    },
    {
      id: 'lt5',
      title: 'Open Circuit',
      artist: 'Mara Voss',
      album: 'Neon Harbor',
      url: 'file:///music/open-circuit.flac',
      source: 'local',
      playcount: 2200000,
      listeners: 210000,
      rank: 5,
      coverArtUrl: cover('neon-harbor'),
    },
  ],
}

const MARA_VOSS_SIMILAR = [
  { name: 'Lune Circuit', match: 0.88, url: '' },
  { name: 'Pale Vessel', match: 0.81, url: '' },
  { name: 'Harbour Lines', match: 0.74, url: '' },
]

const DEMO_CONFIG = {
  lmsHost: 'music-server.local',
  lmsPort: 9000,
  playerId: 'player-living-room',
  hasLastFmKey: true,
  hasFanartKey: true,
  isConfigured: true,
  language: 'en' as const,
  lastFmUsername: 'demo_user',
  hasLastFmSession: true,
  personalRadioEnabled: true,
  scrobblingEnabled: true,
  personalRadioDiscovery: 30,
}

// ── Mock wiring ──────────────────────────────────────────────────────────────

const json200 = async (route: Route, body: unknown): Promise<void> => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

const setupScreenshotMocks = async (page: Page): Promise<void> => {
  await page.route(
    (url: URL) => url.pathname.startsWith('/socket.io'),
    (route: Route) => void route.abort(),
  )

  // Hero image is used directly as CSS background-image (not proxied through /api/).
  // Intercept http://cover.local/** at the network level so the browser gets the SVG.
  await page.route(
    (url: URL) => url.hostname === 'cover.local',
    async (route: Route) => {
      const slug = new URL(route.request().url()).pathname.slice(1)
      return svgResponse(route, slug)
    },
  )

  await page.route(
    (url: URL) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const url = new URL(route.request().url())
      const p = url.pathname
      const m = route.request().method()

      // Cover art proxy — extract the slug from the `src` param and serve an SVG
      if (p === '/api/playback/cover') {
        const src = url.searchParams.get('src') ?? ''
        const slug = src.replace('http://cover.local/', '')
        return svgResponse(route, slug)
      }

      if (p === '/api/search/autocomplete') return json200(route, AUTOCOMPLETE)
      if (p === '/api/search' && m === 'POST') return json200(route, SEARCH_RESULTS)
      if (p === '/api/playback/status') return json200(route, PLAYBACK_STATUS)
      if (p === '/api/playback/volume') return json200(route, { level: 65 })
      if (p === '/api/queue') return json200(route, { tracks: [], radioModeActive: false, radioBoundaryIndex: null })
      if (p === '/api/config') return json200(route, DEMO_CONFIG)
      if (p.startsWith('/api/enrichment/artist/similar')) return json200(route, MARA_VOSS_SIMILAR)
      if (p.startsWith('/api/enrichment/artist/images')) return json200(route, { imageUrl: cover('hero-mara-voss') })
      if (p.startsWith('/api/enrichment/artist')) return json200(route, MARA_VOSS_ENRICHMENT)
      if (p.startsWith('/api/artist/by-name')) return json200(route, MARA_VOSS_ALBUMS)
      if (p.startsWith('/api/artist/top-tracks')) return json200(route, MARA_VOSS_TOP_TRACKS)
      if (p.startsWith('/api/artist/top-albums')) return json200(route, { artist: 'Mara Voss', albums: [] })

      await json200(route, {})
    },
  )
}

// ── Screenshots ──────────────────────────────────────────────────────────────

test('screenshot: search autocomplete', async ({ page }) => {
  await setupScreenshotMocks(page)
  await page.goto('/')

  const input = page.getByTestId('search-input')
  await input.waitFor({ state: 'visible' })
  await input.fill('Nova')

  await page.getByTestId('autocomplete-dropdown').waitFor({ state: 'visible' })
  // Brief pause so cover art SVGs can render
  await page.waitForTimeout(300)

  await page.screenshot({ path: path.join(DOCS, 'search-autocomplete.png') })
})

test('screenshot: search results', async ({ page }) => {
  await setupScreenshotMocks(page)
  await page.goto('/')

  const input = page.getByTestId('search-input')
  await input.waitFor({ state: 'visible' })
  await input.fill('nova')
  await input.press('Enter')

  await page.getByTestId('scroll-header').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)

  await page.screenshot({ path: path.join(DOCS, 'search-results.png') })
})

test('screenshot: now playing mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setupScreenshotMocks(page)
  await page.goto('/now-playing')

  await page.getByTestId('now-playing-panel').waitFor({ state: 'visible' })
  await page.waitForTimeout(400)

  await page.screenshot({ path: path.join(DOCS, 'now-playing-mobile.png') })
})

test('screenshot: artist overview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1700 })
  await setupScreenshotMocks(page)
  await page.goto('/artist/unified?name=Mara+Voss')

  await page.getByText('Mara Voss is a Berlin-based').waitFor({ state: 'visible' })
  // Wait for album sections and cover art to resolve
  await page.waitForTimeout(1000)

  await page.screenshot({ path: path.join(DOCS, 'artist-overview.png') })
})
