import type { Language } from '@/types/i18n'

export type MessageKey =
  | 'settings.title'
  | 'settings.saveSuccess'
  | 'settings.languageSection'
  | 'settings.languageLabel'
  | 'settings.languageEnglish'
  | 'settings.languageGerman'
  | 'settings.saving'
  | 'settings.saveButton'
  | 'settings.backToHome'
  | 'settings.runSetupAgain'
  | 'settings.fullResultsBack'
  | 'settings.discoverScanning'
  | 'settings.discoverButton'
  | 'settings.discoverNone'
  | 'settings.discoverFailed'
  | 'settings.playersButton'
  | 'settings.playersNone'
  | 'settings.playersFailed'
  | 'settings.lastfmPlaceholderConfigured'
  | 'settings.lastfmPlaceholderEmpty'
  | 'settings.fanartPlaceholderConfigured'
  | 'settings.fanartPlaceholderEmpty'
  | 'settings.hostLabel'
  | 'settings.portLabel'
  | 'settings.playerIdLabel'
  | 'nav.settings'
  | 'nav.brandTagline'
  | 'nav.search'
  | 'nav.library'
  | 'nav.queue'
  | 'home.title'
  | 'home.searchPlaceholder'
  | 'home.searchPlaceholderHero'
  | 'home.emptyState.title'
  | 'home.emptyState.description'
  | 'home.minLengthHint'
  | 'home.resultsFor'
  | 'home.loading'
  | 'home.searching'
  | 'home.artistsSection'
  | 'home.tracksSection'
  | 'home.albumsSection'
  | 'home.viewArtist'
  | 'home.goToArtist'
  | 'home.playAlbum'
  | 'home.addAlbumToQueue'
  | 'queue.title'
  | 'queue.empty'
  | 'queue.clear'
  | 'queue.remove'
  | 'queue.backToNowPlaying'
  | 'library.emptyLocal'
  | 'library.emptyTidal'
  | 'library.noGenreMatch'
  | 'library.rescanButton'
  | 'library.rescanScanning'
  | 'library.rescanStarting'
  | 'library.rescanServerError'
  | 'library.displayLimit'
  | 'library.errorLocal'
  | 'library.errorTidal'
  | 'library.sort.artistAz'
  | 'library.sort.titleAz'
  | 'library.sort.yearNewest'
  | 'library.sort.recentlyAdded'
  | 'library.genre.all'
  | 'setup.title'
  | 'setup.next'
  | 'setup.back'
  | 'setup.skip'
  | 'setup.save'
  | 'setup.tryAgain'
  | 'setup.error.loadFailed'
  | 'setup.error.saveFailed'
  | 'setup.hint.connection'
  | 'setup.hint.keys'
  | 'setup.hint.lastfm'
  | 'setup.hint.fanart'
  | 'queue.loading'
  | 'queue.dragHint'
  | 'queue.dropAfter'
  | 'queue.dropBefore'
  | 'queue.dragging'
  | 'queue.dragOverlay'
  | 'queue.nowPlayingLabel'
  | 'settings.section.general'
  | 'settings.section.integration'
  | 'settings.section.experience'
  | 'settings.section.advanced'
  | 'settings.error.loadFailed'
  | 'settings.error.saveFailed'
  | 'artist.enrichment.heading'
  | 'artist.enrichment.error.notFound'
  | 'artist.enrichment.error.unavailable'
  | 'album.enrichment.heading'
  | 'album.enrichment.error.notFound'
  | 'album.enrichment.error.unavailable'
  | 'nowPlaying.emptyTitle'
  | 'nowPlaying.emptySubtitle'
  | 'nowPlaying.upNext'
  | 'nowPlaying.queueEmpty'
  | 'nowPlaying.viewFullQueue'
  | 'nowPlaying.playingBadge'
  | 'nowPlaying.pausedBadge'
  | 'artist.errorNotFoundTitle'
  | 'artist.errorServerTitle'
  | 'artist.errorNotFoundMessage'
  | 'artist.errorServerMessage'
  | 'artist.tidalAlbumCount'
  | 'artist.tidalEmpty'
  | 'artist.localEmpty'
  | 'artist.similarHeading'
  | 'artist.similarInLibrarySr'
  | 'artist.similarMatch'
  | 'queue.radioModeToggle'
  | 'queue.radioModeOn'
  | 'queue.radioModeOff'
  | 'queue.radioModeSeparator'
  | 'queue.updating'
  | 'common.tryAgain'

export const messages: Record<Language, Record<MessageKey, string>> = {
  en: {
    'settings.title': 'Settings',
    'settings.saveSuccess': 'Settings saved',
    'settings.languageSection': 'Language',
    'settings.languageLabel': 'Interface language',
    'settings.languageEnglish': 'English',
    'settings.languageGerman': 'German',
    'settings.saving': 'Saving…',
    'settings.saveButton': 'Save settings',
    'settings.backToHome': 'Back to home',
    'settings.runSetupAgain': 'Run setup wizard again',
    'settings.fullResultsBack': 'Back',
    'settings.discoverScanning': 'Scanning…',
    'settings.discoverButton': 'Discover',
    'settings.discoverNone': 'No LMS servers found on the network.',
    'settings.discoverFailed': 'Server discovery failed.',
    'settings.playersButton': 'List players',
    'settings.playersNone': 'No players found on this server.',
    'settings.playersFailed': 'Could not connect to LMS at {host}:{port}.',
    'settings.lastfmPlaceholderConfigured': 'Enter new key to replace',
    'settings.lastfmPlaceholderEmpty': 'Optional — enables artist enrichment',
    'settings.fanartPlaceholderConfigured': 'Enter new key to replace',
    'settings.fanartPlaceholderEmpty': 'Optional — enables artist hero images',
    'settings.hostLabel': 'LMS Host',
    'settings.portLabel': 'Port',
    'settings.playerIdLabel': 'Player ID',
    'nav.settings': 'Settings',
    'nav.brandTagline': 'Signalform · Focus on the music',
    'nav.search': 'Search',
    'nav.library': 'Library',
    'nav.queue': 'Queue',
    'home.title': 'Start',
    'home.searchPlaceholder': 'Search albums, artists or tracks…',
    'home.searchPlaceholderHero': 'Search for music',
    'home.emptyState.title': 'Nothing here yet',
    'home.emptyState.description': 'Start a search to find music in your library.',
    'home.minLengthHint': 'Type at least 2 characters to see suggestions.',
    'home.resultsFor': 'Results for',
    'home.loading': 'Loading…',
    'home.searching': 'Searching…',
    'home.artistsSection': 'Artists',
    'home.tracksSection': 'Tracks',
    'home.albumsSection': 'Albums',
    'home.viewArtist': 'View artist {name}',
    'home.goToArtist': 'Go to artist',
    'home.playAlbum': 'Play album',
    'home.addAlbumToQueue': 'Add album {title} to queue',
    'queue.title': 'Queue',
    'queue.empty': 'Your queue is currently empty.',
    'queue.clear': 'Clear queue',
    'queue.remove': 'Remove from queue',
    'queue.backToNowPlaying': 'Back to now playing',
    'queue.loading': 'Loading queue…',
    'library.emptyLocal': 'No albums found in your library',
    'library.emptyTidal': 'No albums found in your Tidal library',
    'library.noGenreMatch': 'No albums match the selected genre',
    'library.rescanButton': 'Refresh library',
    'library.rescanScanning': 'Scanning…',
    'library.rescanStarting': 'Starting scan…',
    'library.rescanServerError': 'Could not reach music server',
    'library.displayLimit': 'Showing {limit} of {total} albums — search to find specific albums',
    'library.errorLocal': 'Unable to load library',
    'library.errorTidal': 'Could not load Tidal albums',
    'library.sort.artistAz': 'Artist A–Z',
    'library.sort.titleAz': 'Album A–Z',
    'library.sort.yearNewest': 'Newest',
    'library.sort.recentlyAdded': 'Recently added',
    'library.genre.all': 'All genres',
    'queue.dragHint': 'Drag a row, then release on the highlighted insertion target.',
    'queue.dropAfter': 'Release to move after this track.',
    'queue.dropBefore': 'Release to move before this track.',
    'queue.dragging': 'Dragging this row… release on a highlighted target.',
    'queue.dragOverlay': 'Moving track',
    'queue.nowPlayingLabel': 'Now Playing',
    'setup.title': 'Initial setup',
    'setup.next': 'Next',
    'setup.back': 'Back',
    'setup.skip': 'Skip for now',
    'setup.save': 'Save configuration',
    'setup.tryAgain': 'Try again',
    'setup.error.loadFailed': 'The configuration could not be loaded.',
    'setup.error.saveFailed': 'Saving the configuration failed.',
    'setup.hint.connection': 'Use the host and port of your Logitech Media Server.',
    'setup.hint.keys': 'API keys are optional but improve artwork and scrobbling.',
    'setup.hint.lastfm': 'Free. Register an API application at ',
    'setup.hint.fanart': 'Free. Log in to Fanart.tv and copy your personal API key from ',
    'settings.section.general': 'General',
    'settings.section.integration': 'Integrations',
    'settings.section.experience': 'Experience',
    'settings.section.advanced': 'Advanced',
    'settings.error.loadFailed': 'Settings could not be loaded.',
    'settings.error.saveFailed': 'Saving settings failed.',
    'artist.enrichment.heading': 'Artist biography',
    'artist.enrichment.error.notFound': 'No additional artist information is available.',
    'artist.enrichment.error.unavailable': 'Artist information is currently unavailable.',
    'album.enrichment.heading': 'Album notes',
    'album.enrichment.error.notFound': 'No additional album information is available.',
    'album.enrichment.error.unavailable': 'Album information is currently unavailable.',
    'nowPlaying.emptyTitle': 'No track playing',
    'nowPlaying.emptySubtitle': 'Search and play music to see it here',
    'nowPlaying.upNext': 'Up Next',
    'nowPlaying.queueEmpty': 'Queue is empty',
    'nowPlaying.viewFullQueue': 'View Full Queue',
    'nowPlaying.playingBadge': 'Now Playing',
    'nowPlaying.pausedBadge': 'Paused',
    'artist.errorNotFoundTitle': 'No albums found',
    'artist.errorServerTitle': 'Unable to load artist',
    'artist.errorNotFoundMessage': 'No albums were found for this artist.',
    'artist.errorServerMessage': 'There was a problem loading this artist.',
    'artist.tidalAlbumCount': '{count} {count, plural, one {album} other {albums}}',
    'artist.tidalEmpty': 'No albums found for {name}',
    'artist.localEmpty': 'No albums found for {name}',
    'artist.similarHeading': 'You might also like',
    'artist.similarInLibrarySr': 'In library',
    'artist.similarMatch': '{percent}% match',
    'queue.radioModeToggle': 'Radio',
    'queue.radioModeOn': 'Radio mode is on',
    'queue.radioModeOff': 'Radio mode is off',
    'queue.radioModeSeparator': '— Radio Mode —',
    'queue.updating': 'Updating queue…',
    'common.tryAgain': 'Try Again',
  },
  de: {
    'settings.title': 'Einstellungen',
    'settings.saveSuccess': 'Einstellungen gespeichert',
    'settings.languageSection': 'Sprache',
    'settings.languageLabel': 'Interface-Sprache',
    'settings.languageEnglish': 'Englisch',
    'settings.languageGerman': 'Deutsch',
    'settings.saving': 'Speichern…',
    'settings.saveButton': 'Einstellungen speichern',
    'settings.backToHome': 'Zurück zur Startseite',
    'settings.runSetupAgain': 'Setup-Assistent erneut ausführen',
    'settings.fullResultsBack': 'Zurück',
    'settings.discoverScanning': 'Netzwerk wird durchsucht…',
    'settings.discoverButton': 'Server suchen',
    'settings.discoverNone': 'Keine LMS-Server im Netzwerk gefunden.',
    'settings.discoverFailed': 'Server-Suche ist fehlgeschlagen.',
    'settings.playersButton': 'Player auflisten',
    'settings.playersNone': 'Keine Player auf diesem Server gefunden.',
    'settings.playersFailed': 'Verbindung zum LMS unter {host}:{port} nicht möglich.',
    'settings.lastfmPlaceholderConfigured': 'Neuen Schlüssel eingeben, um zu ersetzen',
    'settings.lastfmPlaceholderEmpty': 'Optional — enables artist enrichment',
    'settings.fanartPlaceholderConfigured': 'Neuen Schlüssel eingeben, um zu ersetzen',
    'settings.fanartPlaceholderEmpty': 'Optional – aktiviert Künstlerbilder',
    'settings.hostLabel': 'LMS Host',
    'settings.portLabel': 'Port',
    'settings.playerIdLabel': 'Player ID',
    'nav.settings': 'Einstellungen',
    'nav.brandTagline': 'Signalform · Fokus auf die Musik',
    'nav.search': 'Suche',
    'nav.library': 'Bibliothek',
    'nav.queue': 'Warteschlange',
    'home.title': 'Startseite',
    'home.searchPlaceholder': 'Alben, Künstler oder Titel suchen…',
    'home.searchPlaceholderHero': 'Nach Musik suchen',
    'home.emptyState.title': 'Hier ist noch nichts',
    'home.emptyState.description': 'Starte eine Suche, um Musik in deiner Bibliothek zu finden.',
    'home.minLengthHint': 'Gib mindestens 2 Zeichen ein, um Vorschläge zu sehen.',
    'home.resultsFor': 'Ergebnisse für',
    'home.loading': 'Wird geladen…',
    'home.searching': 'Suche läuft…',
    'home.artistsSection': 'Künstler',
    'home.tracksSection': 'Titel',
    'home.albumsSection': 'Alben',
    'home.viewArtist': 'Künstler {name} anzeigen',
    'home.goToArtist': 'Zum Künstler',
    'home.playAlbum': 'Album abspielen',
    'home.addAlbumToQueue': 'Album {title} zur Warteschlange hinzufügen',
    'queue.title': 'Warteschlange',
    'queue.empty': 'Deine Warteschlange ist aktuell leer.',
    'queue.clear': 'Warteschlange leeren',
    'queue.remove': 'Aus Warteschlange entfernen',
    'queue.backToNowPlaying': 'Zur aktuellen Wiedergabe',
    'queue.loading': 'Warteschlange wird geladen…',
    'library.emptyLocal': 'Keine Alben in deiner Bibliothek gefunden',
    'library.emptyTidal': 'Keine Alben in deiner Tidal-Bibliothek gefunden',
    'library.noGenreMatch': 'Keine Alben entsprechen dem ausgewählten Genre',
    'library.rescanButton': 'Bibliothek aktualisieren',
    'library.rescanScanning': 'Bibliothek wird durchsucht…',
    'library.rescanStarting': 'Scan wird gestartet…',
    'library.rescanServerError': 'Musikserver konnte nicht erreicht werden',
    'library.displayLimit':
      'Es werden {limit} von {total} Alben angezeigt – nutze die Suche für konkrete Alben',
    'library.errorLocal': 'Bibliothek konnte nicht geladen werden',
    'library.errorTidal': 'Tidal-Alben konnten nicht geladen werden',
    'library.sort.artistAz': 'Künstler A–Z',
    'library.sort.titleAz': 'Album A–Z',
    'library.sort.yearNewest': 'Neueste zuerst',
    'library.sort.recentlyAdded': 'Kürzlich hinzugefügt',
    'library.genre.all': 'Alle Genres',
    'queue.dragHint': 'Ziehe eine Zeile und lasse sie auf dem markierten Ziel los.',
    'queue.dropAfter': 'Nach diesem Titel einfügen.',
    'queue.dropBefore': 'Vor diesem Titel einfügen.',
    'queue.dragging': 'Zeile wird verschoben… lasse sie auf einem markierten Ziel los.',
    'queue.dragOverlay': 'Titel wird verschoben',
    'queue.nowPlayingLabel': 'Läuft gerade',
    'setup.title': 'Ersteinrichtung',
    'setup.next': 'Weiter',
    'setup.back': 'Zurück',
    'setup.skip': 'Später einrichten',
    'setup.save': 'Konfiguration speichern',
    'setup.tryAgain': 'Erneut versuchen',
    'setup.error.loadFailed': 'Die Konfiguration konnte nicht geladen werden.',
    'setup.error.saveFailed': 'Das Speichern der Konfiguration ist fehlgeschlagen.',
    'setup.hint.connection': 'Verwende Host und Port deines Logitech Media Servers.',
    'setup.hint.keys': 'API-Schlüssel sind optional, verbessern aber Cover und Scrobbling.',
    'setup.hint.lastfm': 'Kostenlos. Registriere eine API-Anwendung unter ',
    'setup.hint.fanart':
      'Kostenlos. Melde dich bei Fanart.tv an und kopiere deinen persönlichen API-Key aus deinem Profil: ',
    'settings.section.general': 'Allgemein',
    'settings.section.integration': 'Integrationen',
    'settings.section.experience': 'Erlebnis',
    'settings.section.advanced': 'Erweitert',
    'settings.error.loadFailed': 'Einstellungen konnten nicht geladen werden.',
    'settings.error.saveFailed': 'Das Speichern der Einstellungen ist fehlgeschlagen.',
    'artist.enrichment.heading': 'Künstlerbiografie',
    'artist.enrichment.error.notFound': 'Keine zusätzlichen Künstlerinformationen verfügbar.',
    'artist.enrichment.error.unavailable': 'Künstlerinformationen sind derzeit nicht verfügbar.',
    'album.enrichment.heading': 'Albumnotizen',
    'album.enrichment.error.notFound': 'Keine zusätzlichen Albuminformationen verfügbar.',
    'album.enrichment.error.unavailable': 'Albuminformationen sind derzeit nicht verfügbar.',
    'nowPlaying.emptyTitle': 'Kein Titel wird abgespielt',
    'nowPlaying.emptySubtitle': 'Suche und starte Musik, um sie hier zu sehen',
    'nowPlaying.upNext': 'Als Nächstes',
    'nowPlaying.queueEmpty': 'Die Warteschlange ist leer',
    'nowPlaying.viewFullQueue': 'Warteschlange anzeigen',
    'nowPlaying.playingBadge': 'Läuft gerade',
    'nowPlaying.pausedBadge': 'Pausiert',
    'artist.errorNotFoundTitle': 'Keine Alben gefunden',
    'artist.errorServerTitle': 'Künstler konnte nicht geladen werden',
    'artist.errorNotFoundMessage': 'Für diesen Künstler wurden keine Alben gefunden.',
    'artist.errorServerMessage': 'Beim Laden dieses Künstlers ist ein Fehler aufgetreten.',
    'artist.tidalAlbumCount': '{count} {count, plural, one {Album} other {Alben}}',
    'artist.tidalEmpty': 'Keine Alben für {name} gefunden',
    'artist.localEmpty': 'Keine Alben für {name} gefunden',
    'artist.similarHeading': 'Das könnte dir auch gefallen',
    'artist.similarInLibrarySr': 'In Bibliothek',
    'artist.similarMatch': '{percent}% Übereinstimmung',
    'queue.radioModeToggle': 'Radio',
    'queue.radioModeOn': 'Radiomodus ist an',
    'queue.radioModeOff': 'Radiomodus ist aus',
    'queue.radioModeSeparator': '— Radiomodus —',
    'queue.updating': 'Warteschlange wird aktualisiert…',
    'common.tryAgain': 'Erneut versuchen',
  },
}

export function getMessage(language: Language, key: MessageKey): string {
  const languageMessages = messages[language]
  if (!languageMessages) return key
  return languageMessages[key] ?? key
}
