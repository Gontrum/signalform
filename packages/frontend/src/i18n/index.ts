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
  | 'settings.apiKeyConfigured'
  | 'settings.fanartPlaceholderConfigured'
  | 'settings.fanartPlaceholderEmpty'
  | 'settings.discogsPlaceholderConfigured'
  | 'settings.discogsPlaceholderEmpty'
  | 'settings.hostLabel'
  | 'settings.portLabel'
  | 'settings.playerIdLabel'
  | 'settings.lmsMacAddress'
  | 'settings.lmsMacAddressHint'
  | 'nav.settings'
  | 'nav.primary'
  | 'nav.brandTagline'
  | 'nav.brandMotto'
  | 'nav.search'
  | 'nav.library'
  | 'nav.queue'
  | 'nav.back'
  | 'lms.downBanner'
  | 'connection.lost'
  | 'connection.reconnecting'
  | 'player.statusUnavailable'
  | 'player.lmsDisconnected'
  | 'player.disconnected'
  | 'home.searchPlaceholder'
  | 'home.emptyState.title'
  | 'home.emptyState.description'
  | 'home.minLengthHint'
  | 'home.suggestionsOne'
  | 'home.suggestionsOther'
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
  | 'home.addAlbumToQueueButton'
  | 'queue.title'
  | 'queue.menu'
  | 'queue.empty'
  | 'queue.clear'
  | 'queue.backToNowPlaying'
  | 'queue.jumpFailed'
  | 'library.emptyLocal'
  | 'library.emptyTidal'
  | 'library.featuredTidal'
  | 'library.noFilterMatch'
  | 'library.rescanButton'
  | 'library.rescanScanning'
  | 'library.rescanStarting'
  | 'library.rescanServerError'
  | 'library.loadMore'
  | 'library.loadMoreError'
  | 'library.filterAdjustedSort'
  | 'library.filterAdjustedDecade'
  | 'library.errorLocal'
  | 'library.errorTidal'
  | 'library.sort.artistAz'
  | 'library.sort.titleAz'
  | 'library.sort.yearNewest'
  | 'library.sort.recentlyAdded'
  | 'library.searchLabel'
  | 'library.searchPlaceholder'
  | 'library.genreFilterLabel'
  | 'library.genrePlaceholder'
  | 'library.unknownYear'
  | 'library.browseModeLabel'
  | 'library.browseAlbums'
  | 'library.browseArtists'
  | 'library.artistsEmpty'
  | 'library.errorArtists'
  | 'library.loadMoreArtistsError'
  | 'library.searchArtistsPlaceholder'
  | 'library.recentlyAddedCapNotice'
  | 'library.decadeScopeNotice'
  | 'library.clearFilters'
  | 'library.decadeAll'
  | 'library.decade2020s'
  | 'library.decade2010s'
  | 'library.decade2000s'
  | 'library.decade1990s'
  | 'library.decadeOlder'
  | 'library.filterSummaryNone'
  | 'library.filterSummaryAria'
  | 'library.filterSheetTitle'
  | 'library.filterSheetClose'
  | 'library.filterSheetDone'
  | 'setup.title'
  | 'setup.next'
  | 'setup.back'
  | 'setup.skip'
  | 'setup.save'
  | 'setup.error.loadFailed'
  | 'setup.error.saveFailed'
  | 'setup.hint.connection'
  | 'setup.hint.keys'
  | 'setup.hint.lastfm'
  | 'setup.hint.fanart'
  | 'setup.playerOnline'
  | 'setup.doneConnected'
  | 'queue.loading'
  | 'queue.dragHint'
  | 'queue.dropAfter'
  | 'queue.dropBefore'
  | 'queue.dragging'
  | 'queue.dragOverlay'
  | 'queue.nowPlayingLabel'
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
  | 'album.trackCountOne'
  | 'album.trackCountOther'
  // Both the album and the artist view print the same Last.fm stat line, so the
  // two share one key set rather than keeping wordings that can drift apart.
  | 'enrichment.listenersOne'
  | 'enrichment.listenersOther'
  | 'enrichment.playsOne'
  | 'enrichment.playsOther'
  | 'album.errorNotFoundTitle'
  | 'album.errorNotFoundMessage'
  | 'nowPlaying.emptyTitle'
  | 'nowPlaying.emptySubtitle'
  | 'nowPlaying.upNext'
  | 'nowPlaying.queueEmpty'
  | 'nowPlaying.viewFullQueue'
  | 'nowPlaying.playingBadge'
  | 'nowPlaying.pausedBadge'
  | 'nowPlaying.shuffle.off'
  | 'nowPlaying.shuffle.songs'
  | 'nowPlaying.shuffle.albums'
  | 'nowPlaying.repeat.off'
  | 'nowPlaying.repeat.track'
  | 'nowPlaying.repeat.playlist'
  | 'artist.errorNotFoundMessage'
  | 'artist.errorServerMessage'
  | 'artist.localEmpty'
  | 'artist.topTracksHeading'
  | 'artist.playTopTrack'
  | 'artist.sortLabel'
  | 'artist.sort.year'
  | 'artist.sort.popularity'
  | 'artist.sort.title'
  | 'artist.similarHeading'
  | 'artist.similarInLibrarySr'
  | 'artist.similarMatch'
  | 'queue.radioModeToggle'
  | 'queue.radioModeSeparator'
  | 'queue.updating'
  | 'home.tidalUnavailable'
  | 'common.tryAgain'
  | 'queue.selectMode'
  | 'queue.cancelSelect'
  | 'queue.removeSelected'
  | 'queue.removeTrack'
  | 'queue.reorderTrack'
  | 'queue.selectAll'
  | 'queue.clearConfirm'
  | 'artist.addAllTopTracksToQueue'
  | 'artist.addTopTrackToQueue'
  | 'artist.startRadio'
  | 'artist.radioStarting'
  | 'artist.radioError'
  | 'artist.genreRadioError'
  | 'search.genreRadio'
  | 'search.genreRadioPlaceholder'
  | 'search.genreRadioStart'
  | 'search.genreRadioSearching'
  | 'search.tagsSection'
  | 'search.tagAlbumCountOne'
  | 'search.tagAlbumCountOther'
  | 'tags.title'
  | 'tags.loadMore'
  | 'tags.emptyTitle'
  | 'tags.emptyDescription'
  | 'tags.errorDiscogs'
  | 'tags.errorGeneric'
  | 'tags.badgeLocal'
  | 'tags.badgeTidal'
  | 'settings.lastFm'
  | 'settings.lastFmConnect'
  | 'settings.lastFmConnected'
  | 'settings.lastFmDisconnect'
  | 'settings.lastFmDisconnectConfirm'
  | 'settings.lastFmConfirm'
  | 'settings.lastFmOpenPrompt'
  | 'settings.lastFmAuthError'
  | 'settings.usersSection'
  | 'settings.userNotConnected'
  | 'settings.userRename'
  | 'settings.userRenameSave'
  | 'settings.userRenameCancel'
  | 'settings.userDelete'
  | 'settings.userDeleteConfirm'
  | 'settings.userAddLabel'
  | 'settings.userAddButton'
  | 'settings.userActionError'
  | 'settings.userThisIsMe'
  | 'settings.scrobbleTarget'
  | 'user.selectTitle'
  | 'settings.personalRadio'
  | 'settings.personalRadioHint'
  | 'settings.scrobbling'
  | 'settings.scrobblingHint'
  | 'settings.discoverySlider'
  | 'settings.discoveryComfort'
  | 'settings.discoveryNew'
  | 'home.personalRadio'
  | 'home.personalRadioStarting'
  | 'home.personalRadioError'
  | 'home.lovedRadio'
  | 'home.lovedRadioStarting'
  | 'home.lovedRadioError'
  | 'sleepTimer.label'
  | 'sleepTimer.off'
  | 'sleepTimer.min15'
  | 'sleepTimer.min30'
  | 'sleepTimer.min45'
  | 'sleepTimer.min60'
  | 'playlists.title'
  | 'playlists.namePlaceholder'
  | 'playlists.save'
  | 'playlists.loadAria'
  | 'playlists.deleteConfirm'
  | 'playlists.deleteAria'
  | 'playlists.deleteConfirmAria'
  | 'playlists.renameAria'
  | 'playlists.renameInputAria'
  | 'playlists.renameConfirm'
  | 'playlists.renameCancel'
  | 'playlists.empty'
  | 'playlists.error'
  | 'playlists.errorNoPlaylistDir'
  | 'playlists.errorPlaylistGone'
  | 'playlists.tracksShowAria'
  | 'playlists.tracksHideAria'
  | 'playlists.tracksLoading'
  | 'playlists.tracksEmpty'
  | 'playlists.tracksMore'
  | 'playlists.trackRemoveAria'
  | 'library.sourceLocal'
  | 'library.sourceTidal'
  | 'artist.tidalHeading'
  | 'album.titleFallback'
  | 'nowPlaying.dismissError'
  | 'home.playing'
  | 'source.local'
  | 'source.qobuz'
  | 'source.tidal'
  | 'source.unknown'
  | 'source.streaming'
  | 'source.alsoAvailable'
  | 'source.tooltip.local'
  | 'source.tooltip.qobuz'
  | 'source.tooltip.tidal'
  | 'source.tooltip.unknown'
  | 'settings.apiKeysSection'
  | 'settings.lastfmKeyLabel'
  | 'settings.lastfmSecretLabel'
  | 'settings.fanartKeyLabel'
  | 'settings.discogsTokenLabel'
  | 'settings.discogsTokenHint'
  | 'setup.lastfmKeyLabel'
  | 'setup.lastfmKeyPlaceholder'
  | 'setup.fanartKeyLabel'
  | 'setup.fanartKeyPlaceholder'
  | 'library.sourceTabsLabel'
  | 'library.sortOrderLabel'
  | 'library.decadeFilterLabel'
  | 'library.gridView'
  | 'library.listView'
  | 'library.rescanAriaIdle'
  | 'library.rescanAriaScanning'
  | 'queue.trackListLabel'
  | 'queue.radioBoundaryLabel'
  | 'queue.selectTrack'
  | 'queue.trackLabel'
  | 'queue.trackLabelCurrent'
  | 'nowPlaying.regionLabel'
  | 'nowPlaying.trackAnnouncement'
  | 'nowPlaying.pausedAnnouncement'
  | 'nowPlaying.errorAnnouncement'
  | 'nowPlaying.queuePreviewLabel'
  | 'nowPlaying.queuedTracksLabel'
  | 'nowPlaying.goToArtist'
  | 'nowPlaying.goToAlbum'
  | 'nowPlaying.loveTrack'
  | 'nowPlaying.unloveTrack'
  | 'nowPlaying.volumeControl'
  | 'nowPlaying.volumeSlider'
  | 'nowPlaying.mute'
  | 'nowPlaying.unmute'
  | 'home.resultsListLabel'
  | 'home.autocompleteLabel'
  | 'home.searchForQuery'
  | 'home.addTrackToQueue'
  | 'home.playTrack'
  | 'home.pauseTrack'
  | 'home.playAlbumAria'
  | 'home.goToArtistAria'
  | 'album.playTrack'
  | 'library.viewAlbum'
  | 'nowPlaying.play'
  | 'nowPlaying.pause'
  | 'nowPlaying.skipPrevious'
  | 'nowPlaying.skipNext'
  | 'nowPlaying.playbackTime'
  | 'nowPlaying.playbackPosition'
  | 'quality.ariaLabel'
  | 'quality.ariaLabelLossless'
  | 'quality.sourceAriaLabel'

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
    'settings.apiKeyConfigured': 'configured',
    'settings.fanartPlaceholderConfigured': 'Enter new key to replace',
    'settings.fanartPlaceholderEmpty': 'Optional — enables artist hero images',
    'settings.discogsPlaceholderConfigured': 'Enter new token to replace',
    'settings.discogsPlaceholderEmpty': 'Optional — raises the rate limit for tag imports',
    'settings.hostLabel': 'LMS Host',
    'settings.portLabel': 'Port',
    'settings.playerIdLabel': 'Player ID',
    'settings.lmsMacAddress': 'LMS MAC address (wake-on-LAN)',
    'settings.lmsMacAddressHint':
      'Sent as a wake-up packet when you open the app, so a sleeping server starts up.',
    'nav.settings': 'Settings',
    'nav.primary': 'Primary',
    'nav.brandTagline': 'Signalform · Focus on the music',
    'nav.brandMotto': 'Focus on the music',
    'nav.search': 'Search',
    'nav.library': 'Library',
    'nav.queue': 'Queue',
    'nav.back': 'Back',
    'lms.downBanner': 'LMS server unreachable — trying to wake it…',
    'connection.lost': 'Connection to server lost — reconnecting…',
    'connection.reconnecting': 'Reconnecting to server…',
    'player.statusUnavailable':
      'Speaker is not answering — the music server is reachable, so check the speaker',
    'player.lmsDisconnected': 'Cannot connect to music server',
    'player.disconnected': 'Speaker lost connection to server',
    'home.searchPlaceholder': 'Search albums, artists or tracks…',
    'home.emptyState.title': 'Nothing here yet',
    'home.emptyState.description': 'Start a search to find music in your library.',
    'home.minLengthHint': 'Type at least 2 characters to see suggestions.',
    'home.suggestionsOne': '{count} suggestion',
    'home.suggestionsOther': '{count} suggestions',
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
    'home.addAlbumToQueueButton': 'Queue',
    'queue.title': 'Queue',
    'queue.menu': 'Queue options',
    'queue.empty': 'Your queue is currently empty.',
    'queue.clear': 'Clear queue',
    'queue.backToNowPlaying': 'Back to now playing',
    'queue.jumpFailed': 'Failed to jump to track',
    'queue.loading': 'Loading queue…',
    'library.emptyLocal': 'No albums found in your library',
    'library.emptyTidal': 'No albums found in your Tidal library',
    'library.featuredTidal': 'New on Tidal',
    'library.noFilterMatch': 'No albums match the current filters',
    'library.rescanButton': 'Refresh library',
    'library.rescanScanning': 'Scanning…',
    'library.rescanStarting': 'Starting scan…',
    'library.rescanServerError': 'Could not reach music server',
    'library.loadMore': 'Load more',
    'library.loadMoreError': 'Could not load more albums',
    'library.filterAdjustedSort': 'Sorted by artist — "Recently added" ignores decades',
    'library.filterAdjustedDecade':
      'Decade filter cleared — "Recently added" covers the whole library',
    'library.errorLocal': 'Unable to load library',
    'library.errorTidal': 'Could not load Tidal albums',
    'library.sort.artistAz': 'Artist A–Z',
    'library.sort.titleAz': 'Album A–Z',
    'library.sort.yearNewest': 'Newest',
    'library.sort.recentlyAdded': 'Recently added',
    'library.searchLabel': 'Search the library',
    'library.searchPlaceholder': 'Search albums and artists',
    'library.genreFilterLabel': 'Filter by genre',
    'library.genrePlaceholder': 'Find a genre',
    'library.unknownYear': 'Year unknown',
    'library.browseModeLabel': 'Browse by',
    'library.browseAlbums': 'Albums',
    'library.browseArtists': 'Artists',
    'library.artistsEmpty': 'No artists found',
    'library.errorArtists': 'Unable to load artists',
    'library.loadMoreArtistsError': 'Could not load more artists',
    'library.searchArtistsPlaceholder': 'Search artists',
    'library.recentlyAddedCapNotice':
      'End of the list — LMS reports at most the 100 most recently added albums.',
    'library.decadeScopeNotice':
      'Inside a decade the server orders by year first, then by {sort}. Albums without a release year belong to no decade and show up only without a decade filter.',
    'library.clearFilters': 'Clear all filters',
    'library.decadeAll': 'All years',
    'library.decade2020s': '2020s',
    'library.decade2010s': '2010s',
    'library.decade2000s': '2000s',
    'library.decade1990s': '90s',
    'library.decadeOlder': 'Older',
    'library.filterSummaryNone': 'All albums',
    'library.filterSummaryAria': 'Sort and filter: {filters}',
    'library.filterSheetTitle': 'Sort & filter',
    'library.filterSheetClose': 'Close sort and filter',
    'library.filterSheetDone': 'Show albums',
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
    'setup.error.loadFailed': 'The configuration could not be loaded.',
    'setup.error.saveFailed': 'Saving the configuration failed.',
    'setup.hint.connection': 'Use the host and port of your Logitech Media Server.',
    'setup.hint.keys': 'API keys are optional but improve artwork and scrobbling.',
    'setup.hint.lastfm': 'Free. Register an API application at ',
    'setup.hint.fanart': 'Free. Log in to Fanart.tv and copy your personal API key from ',
    'setup.playerOnline': 'online',
    'setup.doneConnected': 'Signalform is connected to {host} · {player}.',
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
    'album.trackCountOne': '{count} track',
    'album.trackCountOther': '{count} tracks',
    'enrichment.listenersOne': '{count} listener',
    'enrichment.listenersOther': '{count} listeners',
    'enrichment.playsOne': '{count} play',
    'enrichment.playsOther': '{count} plays',
    'album.errorNotFoundTitle': 'Album not found',
    'album.errorNotFoundMessage': 'This album is not available.',
    'nowPlaying.emptyTitle': 'No track playing',
    'nowPlaying.emptySubtitle': 'Search and play music to see it here',
    'nowPlaying.upNext': 'Up Next',
    'nowPlaying.queueEmpty': 'Queue is empty',
    'nowPlaying.viewFullQueue': 'View Full Queue',
    'nowPlaying.playingBadge': 'Now Playing',
    'nowPlaying.pausedBadge': 'Paused',
    'nowPlaying.shuffle.off': 'Shuffle off',
    'nowPlaying.shuffle.songs': 'Shuffle songs',
    'nowPlaying.shuffle.albums': 'Shuffle albums',
    'nowPlaying.repeat.off': 'Repeat off',
    'nowPlaying.repeat.track': 'Repeat track',
    'nowPlaying.repeat.playlist': 'Repeat queue',
    'artist.errorNotFoundMessage': 'No albums were found for this artist.',
    'artist.errorServerMessage': 'There was a problem loading this artist.',
    'artist.localEmpty': 'No albums found for {name}',
    'artist.topTracksHeading': 'Top tracks',
    'artist.playTopTrack': 'Play {title}',
    'artist.sortLabel': 'Sort',
    'artist.sort.year': 'Year',
    'artist.sort.popularity': 'Popular',
    'artist.sort.title': 'A-Z',
    'artist.similarHeading': 'You might also like',
    'artist.similarInLibrarySr': 'In library',
    'artist.similarMatch': '{percent}% match',
    'queue.radioModeToggle': 'Radio',
    'queue.radioModeSeparator': '— Radio Mode —',
    'queue.updating': 'Updating queue…',
    'home.tidalUnavailable': 'Tidal is currently unavailable. Only local results are shown.',
    'common.tryAgain': 'Try Again',
    'queue.selectMode': 'Select',
    'queue.cancelSelect': 'Cancel',
    'queue.removeSelected': 'Remove selected',
    'queue.removeTrack': 'Remove {title} from queue',
    'queue.reorderTrack': 'Reorder {title}',
    'queue.selectAll': 'Select all',
    'queue.clearConfirm': 'Clear?',
    'artist.addAllTopTracksToQueue': 'Add all to queue',
    'artist.addTopTrackToQueue': 'Add {title} to queue',
    'artist.startRadio': 'Artist Radio',
    'artist.radioStarting': 'Starting radio…',
    'artist.radioError': 'Could not start radio',
    'artist.genreRadioError': 'Could not start radio',
    'search.genreRadio': 'Genre Radio',
    'search.genreRadioPlaceholder': 'Type a genre (e.g. Jazz, Punk)…',
    'search.genreRadioStart': 'Start Radio',
    'search.genreRadioSearching': 'Searching…',
    'search.tagsSection': 'Tags',
    'search.tagAlbumCountOne': '{count} album',
    'search.tagAlbumCountOther': '{count} albums',
    'tags.title': 'Tag: {query}',
    'tags.loadMore': 'Load more',
    'tags.emptyTitle': 'No albums found',
    'tags.emptyDescription': 'Discogs has no candidates for this tag.',
    'tags.errorDiscogs': 'Discogs is unreachable — please try again.',
    'tags.errorGeneric': 'This could not be loaded — please try again.',
    'tags.badgeLocal': 'Local',
    'tags.badgeTidal': 'Tidal',
    'settings.lastFm': 'Last.fm',
    'settings.lastFmConnect': 'Connect with Last.fm',
    'settings.lastFmConnected': 'Connected as {username}',
    'settings.lastFmDisconnect': 'Disconnect',
    'settings.lastFmDisconnectConfirm': 'Disconnect?',
    'settings.lastFmConfirm': 'Confirm connection',
    'settings.lastFmOpenPrompt': 'Authorise Signalform on Last.fm, then click confirm.',
    'settings.lastFmAuthError': 'Could not connect. Please try again.',
    'settings.usersSection': 'Users',
    'settings.userNotConnected': 'Not connected to Last.fm',
    'settings.userRename': 'Rename',
    'settings.userRenameSave': 'Save',
    'settings.userRenameCancel': 'Cancel',
    'settings.userDelete': 'Delete',
    'settings.userDeleteConfirm': 'Delete?',
    'settings.userAddLabel': 'New user',
    'settings.userAddButton': 'Add user',
    'settings.userActionError': 'Could not update users. Please try again.',
    'settings.userThisIsMe': 'This is me',
    'settings.scrobbleTarget': 'Currently scrobbling to',
    'user.selectTitle': 'Who are you?',
    'settings.personalRadio': 'Personal Radio',
    'settings.personalRadioHint': 'Plays music based on your Last.fm listening history.',
    'settings.scrobbling': 'Scrobbling',
    'settings.scrobblingHint': 'Tracks plays to your Last.fm profile. Requires connection.',
    'settings.discoverySlider': 'Comfort ↔ Discovery',
    'settings.discoveryComfort': 'Only familiar',
    'settings.discoveryNew': 'Only new',
    'home.personalRadio': 'Personal Radio',
    'home.personalRadioStarting': 'Starting…',
    'home.personalRadioError': 'Could not start Personal Radio.',
    'home.lovedRadio': 'Loved Tracks Radio',
    'home.lovedRadioStarting': 'Starting…',
    'home.lovedRadioError': 'Could not start Loved Tracks Radio.',
    'sleepTimer.label': 'Sleep timer',
    'sleepTimer.off': 'Off',
    'sleepTimer.min15': '15 min',
    'sleepTimer.min30': '30 min',
    'sleepTimer.min45': '45 min',
    'sleepTimer.min60': '60 min',
    'playlists.title': 'Playlists',
    'playlists.namePlaceholder': 'Playlist name',
    'playlists.save': 'Save queue',
    'playlists.loadAria': 'Load playlist {name}',
    'playlists.deleteConfirm': 'Tap again to delete',
    'playlists.deleteAria': 'Delete playlist {name}',
    'playlists.deleteConfirmAria': 'Tap again to delete playlist {name}',
    'playlists.renameAria': 'Rename playlist {name}',
    'playlists.renameInputAria': 'New name for playlist {name}',
    'playlists.renameConfirm': 'Save name',
    'playlists.renameCancel': 'Cancel',
    'playlists.empty': 'No saved playlists yet',
    'playlists.error': 'Something went wrong. Please try again.',
    'playlists.errorNoPlaylistDir':
      'Lyrion Music Server has no playlist folder configured, so it cannot save playlists. Set a playlist folder in the LMS settings.',
    'playlists.errorPlaylistGone':
      'This playlist no longer exists on Lyrion Music Server. Your list was out of date.',
    'playlists.tracksShowAria': 'Show tracks of playlist {name}',
    'playlists.tracksHideAria': 'Hide tracks of playlist {name}',
    'playlists.tracksLoading': 'Loading tracks…',
    'playlists.tracksEmpty': 'This playlist has no tracks',
    'playlists.tracksMore': 'Show more tracks',
    'playlists.trackRemoveAria': 'Remove {title} from playlist {name}',
    'library.sourceLocal': 'Local',
    'library.sourceTidal': 'Tidal',
    'artist.tidalHeading': 'On Tidal',
    'album.titleFallback': 'Album',
    'nowPlaying.dismissError': 'Dismiss',
    'home.playing': 'Playing…',
    'source.local': 'Local',
    'source.qobuz': 'Qobuz',
    'source.tidal': 'Tidal',
    'source.unknown': 'Unknown',
    'source.streaming': 'Streaming',
    'source.alsoAvailable': 'Also available on: {sources}',
    'source.tooltip.local': 'Playing from Local library',
    'source.tooltip.qobuz': 'Streaming from Qobuz',
    'source.tooltip.tidal': 'Streaming from Tidal',
    'source.tooltip.unknown': 'Source unknown',
    'settings.apiKeysSection': 'API Keys',
    'settings.lastfmKeyLabel': 'Last.fm API Key',
    'settings.lastfmSecretLabel': 'Last.fm Shared Secret',
    'settings.fanartKeyLabel': 'Fanart.tv API Key',
    'settings.discogsTokenLabel': 'Discogs Token',
    'settings.discogsTokenHint': 'Optional. Increases the rate limit for tag imports.',
    'setup.lastfmKeyLabel': 'Last.fm API key',
    'setup.lastfmKeyPlaceholder': 'Optional — enables artist enrichment',
    'setup.fanartKeyLabel': 'Fanart.tv API key',
    'setup.fanartKeyPlaceholder': 'Optional — enables artist hero images',
    'library.sourceTabsLabel': 'Music source',
    'library.sortOrderLabel': 'Sort order',
    'library.decadeFilterLabel': 'Filter by decade',
    'library.gridView': 'Grid view',
    'library.listView': 'List view',
    'library.rescanAriaIdle': 'Refresh local library',
    'library.rescanAriaScanning': 'Scanning library…',
    'queue.trackListLabel': 'Queue tracks',
    'queue.radioBoundaryLabel': 'Radio mode starts here',
    'queue.selectTrack': 'Select {title}',
    'queue.trackLabel': '{title} by {name}',
    'queue.trackLabelCurrent': '{title} by {name} — currently playing',
    'nowPlaying.regionLabel': 'Now Playing',
    'nowPlaying.trackAnnouncement': 'Now playing: {title} by {name}',
    'nowPlaying.pausedAnnouncement': 'Paused: {title}',
    'nowPlaying.errorAnnouncement': 'Error: {message}',
    'nowPlaying.queuePreviewLabel': 'Upcoming tracks',
    'nowPlaying.queuedTracksLabel': 'Queued tracks',
    'nowPlaying.goToArtist': 'Go to {name} page',
    'nowPlaying.goToAlbum': 'Go to {title} page',
    'nowPlaying.loveTrack': 'Love track on Last.fm',
    'nowPlaying.unloveTrack': 'Unlove track on Last.fm',
    'nowPlaying.volumeControl': 'Volume control',
    'nowPlaying.volumeSlider': 'Volume slider',
    'nowPlaying.mute': 'Mute',
    'nowPlaying.unmute': 'Unmute',
    'home.resultsListLabel': 'Search results',
    'home.autocompleteLabel': 'Autocomplete suggestions',
    'home.searchForQuery': 'Search for {query}',
    'home.addTrackToQueue': 'Add {title} to queue',
    'home.playTrack': 'Play {title} by {name}',
    'home.pauseTrack': 'Pause {title} by {name}',
    'home.playAlbumAria': 'Play album {title}',
    'home.goToArtistAria': 'Go to artist {name}',
    'album.playTrack': 'Play {title}',
    'library.viewAlbum': 'View {title} by {name}',
    'nowPlaying.play': 'Play',
    'nowPlaying.pause': 'Pause',
    'nowPlaying.skipPrevious': 'Skip to previous track',
    'nowPlaying.skipNext': 'Skip to next track',
    'nowPlaying.playbackTime': 'Playback time: {time}',
    'nowPlaying.playbackPosition': 'Playback position: {time}',
    'quality.ariaLabel': 'Quality: {quality}',
    'quality.ariaLabelLossless': 'Quality: {quality} (lossless)',
    'quality.sourceAriaLabel': 'Source: {source}',
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
    'settings.lastfmPlaceholderEmpty': 'Optional – aktiviert Künstlerinfos',
    'settings.apiKeyConfigured': 'hinterlegt',
    'settings.fanartPlaceholderConfigured': 'Neuen Schlüssel eingeben, um zu ersetzen',
    'settings.fanartPlaceholderEmpty': 'Optional – aktiviert Künstlerbilder',
    'settings.discogsPlaceholderConfigured': 'Neues Token eingeben, um zu ersetzen',
    'settings.discogsPlaceholderEmpty': 'Optional – erhöht das Rate-Limit beim Tag-Import',
    'settings.hostLabel': 'LMS Host',
    'settings.portLabel': 'Port',
    'settings.playerIdLabel': 'Player ID',
    'settings.lmsMacAddress': 'LMS MAC-Adresse (Wake-on-LAN)',
    'settings.lmsMacAddressHint':
      'Wird beim Öffnen der App als Wecksignal geschickt, damit ein schlafender Server hochfährt.',
    'nav.settings': 'Einstellungen',
    'nav.primary': 'Hauptnavigation',
    'nav.brandTagline': 'Signalform · Fokus auf die Musik',
    'nav.brandMotto': 'Fokus auf die Musik',
    'nav.search': 'Suche',
    'nav.library': 'Bibliothek',
    'nav.queue': 'Warteschlange',
    'nav.back': 'Zurück',
    'lms.downBanner': 'LMS-Server nicht erreichbar — Weckversuch läuft…',
    'connection.lost': 'Verbindung zum Server verloren — Wiederverbindung läuft…',
    'connection.reconnecting': 'Verbindung wird wiederhergestellt…',
    'player.statusUnavailable':
      'Lautsprecher antwortet nicht — der Musikserver ist erreichbar, prüfe den Lautsprecher',
    'player.lmsDisconnected': 'Keine Verbindung zum Musikserver',
    'player.disconnected': 'Lautsprecher hat die Verbindung zum Server verloren',
    'home.searchPlaceholder': 'Alben, Künstler oder Titel suchen…',
    'home.emptyState.title': 'Hier ist noch nichts',
    'home.emptyState.description': 'Starte eine Suche, um Musik in deiner Bibliothek zu finden.',
    'home.minLengthHint': 'Gib mindestens 2 Zeichen ein, um Vorschläge zu sehen.',
    'home.suggestionsOne': '{count} Vorschlag',
    'home.suggestionsOther': '{count} Vorschläge',
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
    'home.addAlbumToQueueButton': 'Warteschlange',
    'queue.title': 'Warteschlange',
    'queue.menu': 'Optionen',
    'queue.empty': 'Deine Warteschlange ist aktuell leer.',
    'queue.clear': 'Warteschlange leeren',
    'queue.backToNowPlaying': 'Zur aktuellen Wiedergabe',
    'queue.jumpFailed': 'Wechsel zum Titel fehlgeschlagen',
    'queue.loading': 'Warteschlange wird geladen…',
    'library.emptyLocal': 'Keine Alben in deiner Bibliothek gefunden',
    'library.emptyTidal': 'Keine Alben in deiner Tidal-Bibliothek gefunden',
    'library.featuredTidal': 'Neu bei Tidal',
    'library.noFilterMatch': 'Keine Alben entsprechen den aktuellen Filtern',
    'library.rescanButton': 'Bibliothek aktualisieren',
    'library.rescanScanning': 'Bibliothek wird durchsucht…',
    'library.rescanStarting': 'Scan wird gestartet…',
    'library.rescanServerError': 'Musikserver konnte nicht erreicht werden',
    'library.loadMore': 'Mehr laden',
    'library.loadMoreError': 'Weitere Alben konnten nicht geladen werden',
    'library.filterAdjustedSort':
      'Nach Künstler sortiert – „Kürzlich hinzugefügt" kennt keine Dekaden',
    'library.filterAdjustedDecade':
      'Dekaden-Filter entfernt – „Kürzlich hinzugefügt" gilt für die ganze Bibliothek',
    'library.errorLocal': 'Bibliothek konnte nicht geladen werden',
    'library.errorTidal': 'Tidal-Alben konnten nicht geladen werden',
    'library.sort.artistAz': 'Künstler A–Z',
    'library.sort.titleAz': 'Album A–Z',
    'library.sort.yearNewest': 'Neueste zuerst',
    'library.sort.recentlyAdded': 'Kürzlich hinzugefügt',
    'library.searchLabel': 'Bibliothek durchsuchen',
    'library.searchPlaceholder': 'Alben und Künstler suchen',
    'library.genreFilterLabel': 'Nach Genre filtern',
    'library.genrePlaceholder': 'Genre finden',
    'library.unknownYear': 'Jahr unbekannt',
    'library.browseModeLabel': 'Anzeigen nach',
    'library.browseAlbums': 'Alben',
    'library.browseArtists': 'Künstler',
    'library.artistsEmpty': 'Keine Künstler gefunden',
    'library.errorArtists': 'Künstler konnten nicht geladen werden',
    'library.loadMoreArtistsError': 'Weitere Künstler konnten nicht geladen werden',
    'library.searchArtistsPlaceholder': 'Künstler suchen',
    'library.recentlyAddedCapNotice':
      'Ende der Liste – LMS liefert höchstens die 100 zuletzt hinzugefügten Alben.',
    'library.decadeScopeNotice':
      'Innerhalb einer Dekade ordnet der Server zuerst nach Jahr, darin nach {sort}. Alben ohne Jahresangabe gehören zu keiner Dekade und erscheinen nur ohne Dekaden-Filter.',
    'library.clearFilters': 'Alle Filter zurücksetzen',
    'library.decadeAll': 'Alle Jahre',
    'library.decade2020s': '2020er',
    'library.decade2010s': '2010er',
    'library.decade2000s': '2000er',
    'library.decade1990s': '90er',
    'library.decadeOlder': 'Älter',
    'library.filterSummaryNone': 'Alle Alben',
    'library.filterSummaryAria': 'Sortieren und filtern: {filters}',
    'library.filterSheetTitle': 'Sortieren & filtern',
    'library.filterSheetClose': 'Sortieren und filtern schließen',
    'library.filterSheetDone': 'Alben anzeigen',
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
    'setup.error.loadFailed': 'Die Konfiguration konnte nicht geladen werden.',
    'setup.error.saveFailed': 'Das Speichern der Konfiguration ist fehlgeschlagen.',
    'setup.hint.connection': 'Verwende Host und Port deines Logitech Media Servers.',
    'setup.hint.keys': 'API-Schlüssel sind optional, verbessern aber Cover und Scrobbling.',
    'setup.hint.lastfm': 'Kostenlos. Registriere eine API-Anwendung unter ',
    'setup.hint.fanart':
      'Kostenlos. Melde dich bei Fanart.tv an und kopiere deinen persönlichen API-Key aus deinem Profil: ',
    'setup.playerOnline': 'online',
    'setup.doneConnected': 'Signalform ist mit {host} · {player} verbunden.',
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
    'album.trackCountOne': '{count} Titel',
    'album.trackCountOther': '{count} Titel',
    'enrichment.listenersOne': '{count} Hörer',
    'enrichment.listenersOther': '{count} Hörer',
    'enrichment.playsOne': '{count} Wiedergabe',
    'enrichment.playsOther': '{count} Wiedergaben',
    'album.errorNotFoundTitle': 'Album nicht gefunden',
    'album.errorNotFoundMessage': 'Dieses Album ist nicht verfügbar.',
    'nowPlaying.emptyTitle': 'Kein Titel wird abgespielt',
    'nowPlaying.emptySubtitle': 'Suche und starte Musik, um sie hier zu sehen',
    'nowPlaying.upNext': 'Als Nächstes',
    'nowPlaying.queueEmpty': 'Die Warteschlange ist leer',
    'nowPlaying.viewFullQueue': 'Warteschlange anzeigen',
    'nowPlaying.playingBadge': 'Läuft gerade',
    'nowPlaying.pausedBadge': 'Pausiert',
    'nowPlaying.shuffle.off': 'Zufallswiedergabe aus',
    'nowPlaying.shuffle.songs': 'Titel zufällig',
    'nowPlaying.shuffle.albums': 'Alben zufällig',
    'nowPlaying.repeat.off': 'Wiederholung aus',
    'nowPlaying.repeat.track': 'Titel wiederholen',
    'nowPlaying.repeat.playlist': 'Warteschlange wiederholen',
    'artist.errorNotFoundMessage': 'Für diesen Künstler wurden keine Alben gefunden.',
    'artist.errorServerMessage': 'Beim Laden dieses Künstlers ist ein Fehler aufgetreten.',
    'artist.localEmpty': 'Keine Alben für {name} gefunden',
    'artist.topTracksHeading': 'Top-Titel',
    'artist.playTopTrack': '{title} abspielen',
    'artist.sortLabel': 'Sortieren',
    'artist.sort.year': 'Jahr',
    'artist.sort.popularity': 'Beliebtheit',
    'artist.sort.title': 'A-Z',
    'artist.similarHeading': 'Das könnte dir auch gefallen',
    'artist.similarInLibrarySr': 'In Bibliothek',
    'artist.similarMatch': '{percent}% Übereinstimmung',
    'queue.radioModeToggle': 'Radio',
    'queue.radioModeSeparator': '— Radiomodus —',
    'queue.updating': 'Warteschlange wird aktualisiert…',
    'home.tidalUnavailable':
      'Tidal ist momentan nicht erreichbar. Es werden nur lokale Ergebnisse angezeigt.',
    'common.tryAgain': 'Erneut versuchen',
    'queue.selectMode': 'Auswählen',
    'queue.cancelSelect': 'Abbrechen',
    'queue.removeSelected': 'Auswahl entfernen',
    'queue.removeTrack': '{title} aus Warteschlange entfernen',
    'queue.reorderTrack': '{title} verschieben',
    'queue.selectAll': 'Alle auswählen',
    'queue.clearConfirm': 'Wirklich leeren?',
    'artist.addAllTopTracksToQueue': 'Alle zur Warteschlange',
    'artist.addTopTrackToQueue': '{title} zur Warteschlange hinzufügen',
    'artist.startRadio': 'Künstler-Radio',
    'artist.radioStarting': 'Radio wird gestartet…',
    'artist.radioError': 'Radio konnte nicht gestartet werden',
    'artist.genreRadioError': 'Radio konnte nicht gestartet werden',
    'search.genreRadio': 'Genre-Radio',
    'search.genreRadioPlaceholder': 'Genre eingeben (z. B. Jazz, Punk)…',
    'search.genreRadioStart': 'Radio starten',
    'search.genreRadioSearching': 'Suche läuft…',
    'search.tagsSection': 'Tags',
    'search.tagAlbumCountOne': '{count} Album',
    'search.tagAlbumCountOther': '{count} Alben',
    'tags.title': 'Tag: {query}',
    'tags.loadMore': 'Mehr laden',
    'tags.emptyTitle': 'Keine Alben gefunden',
    'tags.emptyDescription': 'Discogs hat keine Kandidaten für diesen Tag.',
    'tags.errorDiscogs': 'Discogs nicht erreichbar — bitte erneut versuchen.',
    'tags.errorGeneric': 'Das konnte nicht geladen werden — bitte erneut versuchen.',
    'tags.badgeLocal': 'Lokal',
    'tags.badgeTidal': 'Tidal',
    'settings.lastFm': 'Last.fm',
    'settings.lastFmConnect': 'Mit Last.fm verbinden',
    'settings.lastFmConnected': 'Verbunden als {username}',
    'settings.lastFmDisconnect': 'Verbindung trennen',
    'settings.lastFmDisconnectConfirm': 'Wirklich trennen?',
    'settings.lastFmConfirm': 'Verbindung bestätigen',
    'settings.lastFmOpenPrompt':
      'Autorisiere Signalform auf Last.fm und klicke danach auf Bestätigen.',
    'settings.lastFmAuthError': 'Verbindung fehlgeschlagen. Bitte erneut versuchen.',
    'settings.usersSection': 'Benutzer',
    'settings.userNotConnected': 'Nicht mit Last.fm verbunden',
    'settings.userRename': 'Umbenennen',
    'settings.userRenameSave': 'Speichern',
    'settings.userRenameCancel': 'Abbrechen',
    'settings.userDelete': 'Löschen',
    'settings.userDeleteConfirm': 'Wirklich löschen?',
    'settings.userAddLabel': 'Neuer Benutzer',
    'settings.userAddButton': 'Benutzer hinzufügen',
    'settings.userActionError':
      'Benutzer konnten nicht aktualisiert werden. Bitte erneut versuchen.',
    'settings.userThisIsMe': 'Das bin ich',
    'settings.scrobbleTarget': 'Scrobbelt gerade auf',
    'user.selectTitle': 'Wer bist du?',
    'settings.personalRadio': 'Persönliches Radio',
    'settings.personalRadioHint': 'Spielt Musik basierend auf deiner Last.fm-Hörhistorie.',
    'settings.scrobbling': 'Scrobbling',
    'settings.scrobblingHint':
      'Überträgt Wiedergaben an dein Last.fm-Profil. Erfordert Verbindung.',
    'settings.discoverySlider': 'Komfort ↔ Entdeckung',
    'settings.discoveryComfort': 'Nur Bekanntes',
    'settings.discoveryNew': 'Nur Neues',
    'home.personalRadio': 'Persönliches Radio',
    'home.personalRadioStarting': 'Wird gestartet…',
    'home.personalRadioError': 'Persönliches Radio konnte nicht gestartet werden.',
    'home.lovedRadio': 'Loved-Tracks-Radio',
    'home.lovedRadioStarting': 'Wird gestartet…',
    'home.lovedRadioError': 'Loved-Tracks-Radio konnte nicht gestartet werden.',
    'sleepTimer.label': 'Sleep-Timer',
    'sleepTimer.off': 'Aus',
    'sleepTimer.min15': '15 Min',
    'sleepTimer.min30': '30 Min',
    'sleepTimer.min45': '45 Min',
    'sleepTimer.min60': '60 Min',
    'playlists.title': 'Playlists',
    'playlists.namePlaceholder': 'Playlist-Name',
    'playlists.save': 'Queue speichern',
    'playlists.loadAria': 'Playlist {name} laden',
    'playlists.deleteConfirm': 'Zum Löschen erneut tippen',
    'playlists.deleteAria': 'Playlist {name} löschen',
    'playlists.deleteConfirmAria': 'Zum Löschen der Playlist {name} erneut tippen',
    'playlists.renameAria': 'Playlist {name} umbenennen',
    'playlists.renameInputAria': 'Neuer Name für Playlist {name}',
    'playlists.renameConfirm': 'Name speichern',
    'playlists.renameCancel': 'Abbrechen',
    'playlists.empty': 'Noch keine gespeicherten Playlists',
    'playlists.error': 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
    'playlists.errorNoPlaylistDir':
      'Im Lyrion Music Server ist kein Playlist-Ordner konfiguriert, deshalb kann er keine Playlists speichern. Bitte in den LMS-Einstellungen einen Playlist-Ordner festlegen.',
    'playlists.errorPlaylistGone':
      'Diese Playlist gibt es im Lyrion Music Server nicht mehr. Die Liste war nicht mehr aktuell.',
    'playlists.tracksShowAria': 'Titel der Playlist {name} anzeigen',
    'playlists.tracksHideAria': 'Titel der Playlist {name} ausblenden',
    'playlists.tracksLoading': 'Titel werden geladen …',
    'playlists.tracksEmpty': 'Diese Playlist enthält keine Titel',
    'playlists.tracksMore': 'Weitere Titel anzeigen',
    'playlists.trackRemoveAria': '{title} aus Playlist {name} entfernen',
    'library.sourceLocal': 'Lokal',
    'library.sourceTidal': 'Tidal',
    'artist.tidalHeading': 'Bei Tidal',
    'album.titleFallback': 'Album',
    'nowPlaying.dismissError': 'Ausblenden',
    'home.playing': 'Wird gestartet…',
    'source.local': 'Lokal',
    'source.qobuz': 'Qobuz',
    'source.tidal': 'Tidal',
    'source.unknown': 'Unbekannt',
    'source.streaming': 'Streaming',
    'source.alsoAvailable': 'Auch verfügbar auf: {sources}',
    'source.tooltip.local': 'Wird aus der lokalen Bibliothek abgespielt',
    'source.tooltip.qobuz': 'Wird von Qobuz gestreamt',
    'source.tooltip.tidal': 'Wird von Tidal gestreamt',
    'source.tooltip.unknown': 'Quelle unbekannt',
    'settings.apiKeysSection': 'API-Schlüssel',
    'settings.lastfmKeyLabel': 'Last.fm-API-Schlüssel',
    'settings.lastfmSecretLabel': 'Last.fm-Shared-Secret',
    'settings.fanartKeyLabel': 'Fanart.tv-API-Schlüssel',
    'settings.discogsTokenLabel': 'Discogs-Token',
    'settings.discogsTokenHint': 'Optional. Erhöht das Rate-Limit beim Tag-Import.',
    'setup.lastfmKeyLabel': 'Last.fm-API-Schlüssel',
    'setup.lastfmKeyPlaceholder': 'Optional — aktiviert Künstlerinfos',
    'setup.fanartKeyLabel': 'Fanart.tv-API-Schlüssel',
    'setup.fanartKeyPlaceholder': 'Optional — aktiviert Künstlerbilder',
    'library.sourceTabsLabel': 'Musikquelle',
    'library.sortOrderLabel': 'Sortierung',
    'library.decadeFilterLabel': 'Nach Dekade filtern',
    'library.gridView': 'Rasteransicht',
    'library.listView': 'Listenansicht',
    'library.rescanAriaIdle': 'Lokale Bibliothek aktualisieren',
    'library.rescanAriaScanning': 'Bibliothek wird durchsucht…',
    'queue.trackListLabel': 'Titel in der Warteschlange',
    'queue.radioBoundaryLabel': 'Ab hier beginnt der Radiomodus',
    'queue.selectTrack': '{title} auswählen',
    'queue.trackLabel': '{title} von {name}',
    'queue.trackLabelCurrent': '{title} von {name} — läuft gerade',
    'nowPlaying.regionLabel': 'Läuft gerade',
    'nowPlaying.trackAnnouncement': 'Läuft jetzt: {title} von {name}',
    'nowPlaying.pausedAnnouncement': 'Pausiert: {title}',
    'nowPlaying.errorAnnouncement': 'Fehler: {message}',
    'nowPlaying.queuePreviewLabel': 'Kommende Titel',
    'nowPlaying.queuedTracksLabel': 'Titel in der Warteschlange',
    'nowPlaying.goToArtist': 'Zur Seite von {name}',
    'nowPlaying.goToAlbum': 'Zum Album {title}',
    'nowPlaying.loveTrack': 'Titel auf Last.fm liken',
    'nowPlaying.unloveTrack': 'Like auf Last.fm entfernen',
    'nowPlaying.volumeControl': 'Lautstärkeregelung',
    'nowPlaying.volumeSlider': 'Lautstärkeregler',
    'nowPlaying.mute': 'Stummschalten',
    'nowPlaying.unmute': 'Stummschaltung aufheben',
    'home.resultsListLabel': 'Suchergebnisse',
    'home.autocompleteLabel': 'Suchvorschläge',
    'home.searchForQuery': 'Nach {query} suchen',
    'home.addTrackToQueue': '{title} zur Warteschlange hinzufügen',
    'home.playTrack': '{title} von {name} abspielen',
    'home.pauseTrack': '{title} von {name} pausieren',
    'home.playAlbumAria': 'Album {title} abspielen',
    'home.goToArtistAria': 'Zum Künstler {name}',
    'album.playTrack': '{title} abspielen',
    'library.viewAlbum': '{title} von {name} anzeigen',
    'nowPlaying.play': 'Abspielen',
    'nowPlaying.pause': 'Pause',
    'nowPlaying.skipPrevious': 'Zum vorherigen Titel springen',
    'nowPlaying.skipNext': 'Zum nächsten Titel springen',
    'nowPlaying.playbackTime': 'Wiedergabezeit: {time}',
    'nowPlaying.playbackPosition': 'Wiedergabeposition: {time}',
    'quality.ariaLabel': 'Qualität: {quality}',
    'quality.ariaLabelLossless': 'Verlustfreie Qualität: {quality}',
    'quality.sourceAriaLabel': 'Quelle: {source}',
  },
}

export function getMessage(language: Language, key: MessageKey): string {
  const languageMessages = messages[language]
  if (!languageMessages) return key
  return languageMessages[key] ?? key
}
