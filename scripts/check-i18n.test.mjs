// A guard that flags everything is as useless as one that flags nothing, and
// the shapes below are not invented: each "accepts" case is a line that lives
// in packages/frontend/src today and must stay green, each "flags" case is a
// defect that actually shipped.
import assert from "node:assert/strict";
import test from "node:test";

import {
  collectPlaceholderKeys,
  findFrozenTranslatorViolations,
  findLabelViolations,
  findLiveRegionViolations,
  findPlaceholderViolations,
  findRenderedTextViolations,
  findStateTextViolations,
  findVisibleTextViolations,
} from "./check-i18n.mjs";

const sfc = (script, template) =>
  `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n${template}\n</template>\n`;

test("rule 1 flags a static English aria-label", () => {
  const violations = findLabelViolations(
    "QueueView.vue",
    sfc("", `  <ul aria-label="Queue tracks">\n    <li />\n  </ul>`),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0].expression, /Queue tracks/);
  assert.equal(violations[0].line, 6);
});

test("rule 1 flags a literal inside a binding", () => {
  const violations = findLabelViolations(
    "PlaybackControls.vue",
    sfc("", `  <button :aria-label="'Skip to previous track'" />`),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0].expression, /Skip to previous track/);
});

test("rule 1 flags English text in a template literal", () => {
  const violations = findLabelViolations(
    "SearchResultsList.vue",
    sfc("", '  <button :aria-label="`Play ${track.title}`" />'),
  );

  assert.equal(violations.length, 1);
});

test("rule 1 flags both branches of a ternary", () => {
  const violations = findLabelViolations(
    "PlaybackControls.vue",
    sfc("", `  <button :aria-label="isPlaying ? 'Pause' : 'Play'" />`),
  );

  assert.equal(violations.length, 1);
});

test("rule 1 flags an English literal nested in an interpolation", () => {
  const violations = findLabelViolations(
    "QueueView.vue",
    sfc(
      "",
      "  <button :aria-label=\"`${track.title}${track.isCurrent ? ' currently playing' : ''}`\" />",
    ),
  );

  assert.equal(violations.length, 1);
});

test("rule 1 flags an English label assembled in a named computed", () => {
  const content = sfc(
    `const ariaLabel = computed((): string => {\n  if (props.quality) return \`Quality: \${badgeText.value}\`\n  return badgeText.value\n})`,
    `  <span :aria-label="ariaLabel" />`,
  );

  const violations = findLabelViolations("QualityBadge.vue", content);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
  assert.match(violations[0].expression, /ariaLabel \(bound to :aria-label/);
});

test("rule 1 accepts a t() call, plain or filled", () => {
  const content = sfc(
    "",
    [
      `  <button :aria-label="t('nowPlaying.skipPrevious')" />`,
      `  <button :aria-label="t('queue.removeTrack').replace('{title}', track.title)" />`,
      `  <button :aria-label="isPlaying ? t('nowPlaying.pause') : t('nowPlaying.play')" />`,
    ].join("\n"),
  );

  assert.deepEqual(findLabelViolations("Ok.vue", content), []);
});

test("rule 1 accepts a label that only concatenates data", () => {
  const content = sfc(
    "",
    "  <li :aria-label=\"`${suggestion.artist}${suggestion.album ? ` - ${suggestion.album}` : ''}`\" />",
  );

  assert.deepEqual(
    findLabelViolations("AutocompleteDropdown.vue", content),
    [],
  );
});

test("rule 1 accepts a passed-through prop with no local definition", () => {
  const content = sfc(
    `const props = defineProps<{ readonly ariaLabel?: string }>()`,
    `  <div :aria-label="ariaLabel" />`,
  );

  assert.deepEqual(findLabelViolations("Popover.vue", content), []);
});

test("rule 1 accepts a named computed and a helper that route through t()", () => {
  const content = sfc(
    [
      `const navigateAriaLabel = computed(() =>`,
      `  i18n`,
      `    .t('library.viewAlbum')`,
      `    .replace('{title}', props.album.title)`,
      `    .replace('{name}', props.album.artist),`,
      `)`,
      ``,
      `const jumpToTrackAriaLabel = (track: Track): string =>`,
      `  t(track.isCurrent ? 'queue.trackLabelCurrent' : 'queue.trackLabel')`,
      `    .replace('{title}', track.title)`,
      `    .replace('{name}', track.artist)`,
    ].join("\n"),
    `  <a :aria-label="navigateAriaLabel" />\n  <button :aria-label="jumpToTrackAriaLabel(track)" />`,
  );

  assert.deepEqual(findLabelViolations("AlbumCard.vue", content), []);
});

test("rule 1 accepts a label made of a proper noun but not one hiding behind it", () => {
  assert.deepEqual(
    findLabelViolations("Badge.vue", sfc("", `  <span aria-label="Tidal" />`)),
    [],
  );

  assert.equal(
    findLabelViolations(
      "Badge.vue",
      sfc("", `  <span aria-label="Tidal albums" />`),
    ).length,
    1,
  );
});

test("rule 1 flags a static English alt", () => {
  const violations = findLabelViolations(
    "MainNavBar.vue",
    sfc("", `  <img src="/icon-192.png" alt="Signalform icon" />`),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0].expression, /Signalform icon/);
});

test("rule 1 flags the English glue in a bound alt", () => {
  const content = sfc(
    "",
    [
      '  <img :alt="`${album.title} by ${album.artist}`" />',
      '  <img :alt="`${album.title} cover art`" />',
    ].join("\n"),
  );

  assert.equal(findLabelViolations("AlbumCard.vue", content).length, 2);
});

// The decorative case, and the reason `alt` needs no key of its own when the
// title sits next to the image: an empty alt has no words to translate.
test("rule 1 accepts an empty alt", () => {
  const content = sfc(
    "",
    `  <img src="/icon-192.png" alt="" />\n  <img :src="album.coverArtUrl" alt="" />`,
  );

  assert.deepEqual(findLabelViolations("MainNavBar.vue", content), []);
});

test("rule 1 accepts an alt that is data or a t() call", () => {
  const content = sfc(
    "",
    [
      `  <img :alt="artist.name" />`,
      `  <img :alt="t('album.coverAlt').replace('{title}', album.title)" />`,
    ].join("\n"),
  );

  assert.deepEqual(findLabelViolations("SearchResultsList.vue", content), []);
});

test("rule 1 accepts an alt passed through as a prop", () => {
  const content = sfc(
    `const props = withDefaults(defineProps<{ alt?: string }>(), { alt: '' })`,
    `  <img :src="coverArtUrl" :alt="alt" />`,
  );

  assert.deepEqual(findLabelViolations("AlbumCover.vue", content), []);
});

// The prop-default half of rule 1: `alt=""` at the call site proves nothing
// about the component's own default, which is what a consumer that omits the
// prop actually gets.
test("rule 1 flags an English prop default for an accessible name", () => {
  const content = sfc(
    [
      `const props = withDefaults(`,
      `  defineProps<{`,
      `    coverArtUrl?: string`,
      `    alt?: string`,
      `  }>(),`,
      `  { coverArtUrl: undefined, alt: 'Album cover' },`,
      `)`,
    ].join("\n"),
    `  <img :src="props.coverArtUrl" :alt="alt" />`,
  );

  const violations = findLabelViolations("AlbumCover.vue", content);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 7);
  assert.match(violations[0].expression, /'Album cover' \(prop default\)/);
});

test("rule 1 flags an English default in the 3.5 props destructure", () => {
  const content = sfc(
    `const { ariaLabel = 'Close dialog' } = defineProps<Props>()`,
    `  <button :aria-label="ariaLabel" />`,
  );

  const violations = findLabelViolations("Sheet.vue", content);

  assert.equal(violations.length, 1);
  assert.match(violations[0].expression, /'Close dialog' \(prop default\)/);
});

test("rule 1 accepts prop defaults that are empty or routed through t()", () => {
  const content = sfc(
    [
      `const props = withDefaults(defineProps<{ alt?: string }>(), { alt: '' })`,
      `const other = withDefaults(defineProps<{ title?: string }>(), {`,
      `  title: t('album.coverTitle'),`,
      `  ariaLabel: t('album.coverAlt').replace('{title}', 'x'),`,
      `})`,
      `const { alt = '' } = defineProps<Props>()`,
    ].join("\n"),
    `  <img :src="props.coverArtUrl" :alt="alt" />`,
  );

  assert.deepEqual(findLabelViolations("AlbumCover.vue", content), []);
});

// The prop names carrying an accessible name are enumerated; a default on any
// other prop is a value, not a label, and English is fine there.
test("rule 1 leaves prop defaults other than the accessible names alone", () => {
  const content = sfc(
    [
      `const props = withDefaults(defineProps<Props>(), {`,
      `  size: 'compact',`,
      `  testId: 'artist-hero',`,
      `  imageAlt: 'Album cover',`,
      `})`,
    ].join("\n"),
    `  <div :data-testid="testId" />`,
  );

  assert.deepEqual(findLabelViolations("AlbumActionButtons.vue", content), []);
});

// The inline type literal declares names, not values: `title: string` is a
// type annotation and must not be mistaken for an English default.
test("rule 1 reads only the defaults object of withDefaults", () => {
  const content = sfc(
    [
      `const props = withDefaults(`,
      `  defineProps<{ title: string; alt?: string }>(),`,
      `  { alt: '' },`,
      `)`,
    ].join("\n"),
    `  <img :alt="alt" />`,
  );

  assert.deepEqual(findLabelViolations("PageHeader.vue", content), []);
});

test("rule 1 leaves attributes that merely end in -alt alone", () => {
  const content = sfc(
    "",
    `  <img data-fallback-alt="Album cover" :data-alt="'Album cover'" />`,
  );

  assert.deepEqual(findLabelViolations("AlbumCover.vue", content), []);
});

test("rule 1 ignores aria-labelledby", () => {
  const content = sfc("", `  <div aria-labelledby="user-select-title" />`);

  assert.deepEqual(findLabelViolations("UserSelectDialog.vue", content), []);
});

const I18N_SOURCE = [
  `export const messages = {`,
  `  en: {`,
  `    'home.viewArtist': 'View artist {name}',`,
  `    'home.addAlbumToQueue': 'Add album {title} to queue',`,
  `    'library.decadeScopeNotice': 'Ordered by year, then by {sort}.',`,
  `    'album.trackCountOne': '{count} track',`,
  `    'album.trackCountOther': '{count} tracks',`,
  `    'queue.title': 'Queue',`,
  `  },`,
  `  de: {`,
  `    'home.viewArtist': 'Künstler {name} anzeigen',`,
  `    'home.addAlbumToQueue': 'Album {title} zur Warteschlange',`,
  `    'library.decadeScopeNotice': 'Nach Jahr, dann nach {sort}.',`,
  `    'album.trackCountOne': '{count} Titel',`,
  `    'album.trackCountOther': '{count} Titel',`,
  `    'queue.title': 'Warteschlange',`,
  `  },`,
  `}`,
].join("\n");

const PLACEHOLDER_KEYS = collectPlaceholderKeys(I18N_SOURCE);

test("collectPlaceholderKeys takes only keys whose message carries a placeholder", () => {
  assert.deepEqual([...PLACEHOLDER_KEYS].sort(), [
    "album.trackCountOne",
    "album.trackCountOther",
    "home.addAlbumToQueue",
    "home.viewArtist",
    "library.decadeScopeNotice",
  ]);
});

test("rule 2 flags an appended value instead of a filled placeholder", () => {
  const violations = findPlaceholderViolations(
    "AlbumActionButtons.vue",
    "const label = `${t('home.addAlbumToQueue')} ${props.albumTitle}`\n",
    PLACEHOLDER_KEYS,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 1);
  assert.match(violations[0].expression, /home\.addAlbumToQueue/);
});

test("rule 2 flags a concatenated value", () => {
  const violations = findPlaceholderViolations(
    "SearchResultsList.vue",
    "const label = t('home.viewArtist') + ' ' + artist.name\n",
    PLACEHOLDER_KEYS,
  );

  assert.equal(violations.length, 1);
});

test("rule 2 accepts .replace() on the same line", () => {
  const violations = findPlaceholderViolations(
    "SearchResultsList.vue",
    "const label = t('home.viewArtist').replace('{name}', artist.name)\n",
    PLACEHOLDER_KEYS,
  );

  assert.deepEqual(violations, []);
});

test("rule 2 accepts .replace() on a following line of a chained call", () => {
  const content = [
    `const navigateAriaLabel = computed(() =>`,
    `  i18n`,
    `    .t('home.addAlbumToQueue')`,
    `    .replace('{title}', props.album.title),`,
    `)`,
  ].join("\n");

  assert.deepEqual(
    findPlaceholderViolations("AlbumCard.vue", content, PLACEHOLDER_KEYS),
    [],
  );
});

test("rule 2 accepts a declared core substitution helper", () => {
  const content =
    "const message = buildDecadeScopeMessage(t('library.decadeScopeNotice'), sortLabel.value)\n";

  assert.deepEqual(
    findPlaceholderViolations(
      "useLibraryBrowser.ts",
      content,
      PLACEHOLDER_KEYS,
    ),
    [],
  );
});

test("rule 2 accepts a plural pair filled by a declared helper", () => {
  const content =
    "const label = (count) =>\n  buildCountLabel(count, t('album.trackCountOne'), t('album.trackCountOther'), locale())\n";

  assert.deepEqual(
    findPlaceholderViolations("AlbumDetailView.vue", content, PLACEHOLDER_KEYS),
    [],
  );
});

// The helper name anywhere in the file must not excuse a key it never wraps.
test("rule 2 still flags a plural key the helper never reaches", () => {
  const content = [
    `const label = t('album.trackCountOther')`,
    `const spacer = 1`,
    `const filler = 2`,
    `const other = buildCountLabel(count, one, two, locale())`,
  ].join("\n");

  const violations = findPlaceholderViolations(
    "AlbumDetailView.vue",
    content,
    PLACEHOLDER_KEYS,
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0].expression, /album\.trackCountOther/);
});

test("rule 2 leaves keys without a placeholder alone", () => {
  const violations = findPlaceholderViolations(
    "QueueView.vue",
    "const heading = t('queue.title')\n",
    PLACEHOLDER_KEYS,
  );

  assert.deepEqual(violations, []);
});

test("rule 3 flags a translator captured off the store", () => {
  const violations = findFrozenTranslatorViolations(
    "QueueView.vue",
    "const i18nStore = useI18nStore()\nconst t = i18nStore.t\n",
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
  assert.equal(violations[0].expression, "const t = i18nStore.t");
});

test("rule 3 accepts the call-through form and storeToRefs", () => {
  const content = [
    `const t = (key: MessageKey): string => i18nStore.t(key)`,
    `const { t: reactiveT } = storeToRefs(i18nStore)`,
    `const { t } = storeToRefs(i18nStore)`,
    `const translate = i18nStore.t`,
  ].join("\n");

  assert.deepEqual(findFrozenTranslatorViolations("Ok.vue", content), []);
});

// Rule 4 — the .ts half. The "accepts" cases carry the weight here: a `.ts`
// file is mostly English that no user ever sees, and a guard that reports
// developer text is a guard someone turns off within the week.

const noModules = () => undefined;

test("rule 4 flags a sentence assigned straight to reactive state", () => {
  const content = [
    `on('system.lmsDisconnected', () => {`,
    `  lmsError.value = 'Cannot connect to music server'`,
    `})`,
  ].join("\n");

  const violations = findStateTextViolations("usePlaybackStore.ts", content);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
  assert.equal(
    violations[0].expression,
    "lmsError.value = 'Cannot connect to music server'",
  );
});

test("rule 4 flags a sentence a computed renders itself", () => {
  const content = [
    `const jumpAlert = computed(() =>`,
    `  hasFailed.value ? 'Failed to jump to track' : null,`,
    `)`,
  ].join("\n");

  const violations = findRenderedTextViolations(
    "useQueueStore.ts",
    content,
    noModules,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
  assert.match(violations[0].expression, /Failed to jump to track/);
});

// The defect that started rule 4: the sentence lives in core, the computed
// that renders it lives in the shell, and no single file shows both halves.
test("rule 4 follows a computed into the module it imports the builder from", () => {
  const shell = [
    `import { createTrackAnnouncement } from '@/domains/playback/core/service'`,
    ``,
    `const trackAnnouncement = computed((): string =>`,
    `  createTrackAnnouncement(playbackStore.currentTrack),`,
    `)`,
  ].join("\n");
  const core = [
    `export const createTrackAnnouncement = (track: TrackInfo | null): string => {`,
    `  if (track === null) {`,
    `    return ''`,
    `  }`,
    ``,
    "  return `Now playing: ${track.title} by ${track.artist}`",
    `}`,
  ].join("\n");

  const violations = findRenderedTextViolations(
    "useNowPlayingPanel.ts",
    shell,
    (specifier) =>
      specifier === "@/domains/playback/core/service"
        ? { file: "service.ts", content: core }
        : undefined,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, "service.ts");
  assert.equal(violations[0].line, 6);
  assert.match(violations[0].expression, /createTrackAnnouncement\(\)/);
});

test("rule 4 follows a computed into a helper declared in the same file", () => {
  const content = [
    `const describeScan = (step: string): string => \`Now scanning \${step}\``,
    ``,
    `const rescanLine = computed(() => describeScan(currentStep.value))`,
  ].join("\n");

  const violations = findRenderedTextViolations(
    "useLibraryBrowser.ts",
    content,
    noModules,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 1);
});

// Every one of these is a line that lives in packages/frontend/src today.
test("rule 4 accepts state values that are enums, keys or empty", () => {
  const content = [
    `status.value = 'loading'`,
    `artistsStatus.value = 'success'`,
    `activeSource.value = 'local'`,
    `sortBy.value = 'recently-added'`,
    `lastFmAuthStep.value = 'pending-user'`,
    `saveError.value = 'settings.error.saveFailed'`,
    `searchQuery.value = ''`,
    `connectionState.value = "reconnecting"`,
  ].join("\n");

  assert.deepEqual(findStateTextViolations("useSettingsView.ts", content), []);
});

test("rule 4 accepts state assigned from the translator", () => {
  const content = [
    `rescanMessage.value = t('library.rescanStarting')`,
    `rescanMessage.value = buildRescanProgressMessage(t('library.rescanScanning'), step)`,
  ].join("\n");

  assert.deepEqual(
    findStateTextViolations("useLibraryBrowser.ts", content),
    [],
  );
});

// Developer text: none of it is reachable from a screen, and all of it would
// be reported by a rule that simply looked for English in a `.ts` file.
test("rule 4 stays silent on thrown errors, logs and error payloads", () => {
  const content = [
    `if (!response.ok) {`,
    `  throw new Error('Failed to load the album page')`,
    `}`,
    `console.warn('WebSocket reconnect attempt exceeded the limit')`,
    `return { type: 'NETWORK_ERROR', message: 'Unknown network error occurred' }`,
    `const FALLBACK_MESSAGE = 'Could not reach the music server'`,
  ].join("\n");

  assert.deepEqual(findStateTextViolations("queueApi.ts", content), []);
  assert.deepEqual(
    findRenderedTextViolations("queueApi.ts", content, noModules),
    [],
  );
});

// The declared boundary: a fallback handed to a mapper may well be translated
// by that mapper, and nothing in this file says whether it is.
test("rule 4 leaves a literal passed as an argument alone", () => {
  const content =
    "lastMutationError.value = mapQueueMutationError(result.error, 'Failed to remove track')\n";

  assert.deepEqual(findStateTextViolations("useQueueStore.ts", content), []);
});

test("rule 4 accepts a computed whose builder only assembles t() output", () => {
  const shell = [
    `import { createAlsoAvailableText } from '@/domains/playback/core/service'`,
    ``,
    `const alsoAvailableText = computed((): string =>`,
    `  createAlsoAvailableText((key) => i18nStore.t(key), playbackStore.currentTrack),`,
    `)`,
  ].join("\n");
  const core = [
    `export const createAlsoAvailableText = (t: SourceTranslator, track: TrackInfo): string =>`,
    `  t('source.alsoAvailable').replace('{sources}', sources.join(', '))`,
  ].join("\n");

  assert.deepEqual(
    findRenderedTextViolations("useNowPlayingPanel.ts", shell, () => ({
      file: "service.ts",
      content: core,
    })),
    [],
  );
});

test("rule 4 accepts a computed over data, flags and proper nouns", () => {
  const content = [
    `const hasMore = computed(() => hasMoreState.value)`,
    `const label = computed(() => \`\${album.title} — \${album.artist}\`)`,
    `const badge = computed(() => (isTidal.value ? 'Tidal' : 'Qobuz'))`,
    `const sortKey = computed(() => (byYear.value ? 'year-newest' : 'artist-az'))`,
  ].join("\n");

  assert.deepEqual(
    findRenderedTextViolations("useLibraryBrowser.ts", content, noModules),
    [],
  );
});

test("rule 4 ignores a call it cannot resolve to frontend source", () => {
  const content = [
    `import { formatDistanceToNow } from 'date-fns'`,
    ``,
    `const played = computed(() => formatDistanceToNow(track.value.playedAt))`,
  ].join("\n");

  assert.deepEqual(
    findRenderedTextViolations("useHistory.ts", content, noModules),
    [],
  );
});

// Rule 5 — the spoken regions. Every "accepts" case below is a region that
// lives in packages/frontend/src today: those carry the weight, because a
// template holds far more text than a translatable sentence, and the whole
// rule rests on none of that text reaching it.

test("rule 5 flags the announcement that shipped in an aria-live region", () => {
  const violations = findLiveRegionViolations(
    "SearchResultsList.vue",
    sfc(
      "",
      [
        `  <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">`,
        `    <span v-if="playbackStore.isCurrentlyPlaying">`,
        `      Now playing: {{ playbackStore.currentTrack.title }} by`,
        `      {{ playbackStore.currentTrack.artist }}`,
        `    </span>`,
        `  </div>`,
      ].join("\n"),
    ),
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 8);
  assert.match(violations[0].expression, /Now playing: by/);
});

// A single word is enough here: nothing in these regions is ever displayed, so
// there is no such thing as a word that happens not to be read out.
test("rule 5 flags one English word in an sr-only element", () => {
  const violations = findLiveRegionViolations(
    "LoadingSpinner.vue",
    sfc("", `  <span class="sr-only">Loading</span>`),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0].expression, /Loading/);
});

test("rule 5 reports a region once, however deeply the text is nested", () => {
  const violations = findLiveRegionViolations(
    "QueueView.vue",
    sfc(
      "",
      [
        `  <div aria-live="polite">`,
        `    <p>`,
        `      <span class="sr-only">Moved to position</span>`,
        `    </p>`,
        `  </div>`,
      ].join("\n"),
    ),
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0].expression, /Moved to position/);
});

test("rule 5 accepts regions that render only t() and interpolations", () => {
  const content = sfc(
    "",
    [
      `  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">`,
      `    <span v-if="playbackStore.isLoading">{{ t('home.loading') }}</span>`,
      `    <span v-else-if="playbackStore.isPaused">{{ t('nowPlaying.pausedBadge') }}</span>`,
      `  </div>`,
      `  <div data-testid="queue-drop-live-region" aria-live="polite" class="sr-only">`,
      `    {{ dragOverlayLabel ?? '' }}`,
      `  </div>`,
      `  <div class="sr-only" aria-live="polite">{{ trackAnnouncement }}</div>`,
    ].join("\n"),
  );

  assert.deepEqual(findLiveRegionViolations("Ok.vue", content), []);
});

test("rule 5 accepts separators, digits and a proper noun", () => {
  const content = sfc(
    "",
    [
      `  <div aria-live="polite">{{ listeners }} · {{ plays }} — 2010s</div>`,
      `  <span class="sr-only">Tidal</span>`,
    ].join("\n"),
  );

  assert.deepEqual(findLiveRegionViolations("Stats.vue", content), []);
});

// The `>` of an arrow function inside an attribute ends no tag, and no
// attribute value is text a screen reader reads: rule 1 owns those.
test("rule 5 reads text nodes, not the attributes around them", () => {
  const content = sfc(
    "",
    [
      `  <div`,
      `    aria-live="polite"`,
      `    :title="t('queue.dropHint')"`,
      `    @click="() => close()"`,
      `    :class="isPhone ? 'sr-only' : 'text-sm'"`,
      `  >`,
      `    {{ message }}`,
      `  </div>`,
    ].join("\n"),
  );

  assert.deepEqual(findLiveRegionViolations("QueueView.vue", content), []);
});

test("rule 5 leaves visible text outside a spoken region alone", () => {
  const content = sfc(
    "",
    [
      `  <div aria-live="polite">{{ rescanMessage }}</div>`,
      `  <p data-testid="album-track-count">{{ album.tracks.length }} tracks</p>`,
      `  <span>+ Queue</span>`,
    ].join("\n"),
  );

  assert.deepEqual(
    findLiveRegionViolations("AlbumDetailView.vue", content),
    [],
  );
});

test("rule 5 ends a self-closing region at its own tag", () => {
  const content = sfc(
    "",
    [
      `  <span class="sr-only" aria-hidden="true" />`,
      `  <p>Signalform is connected to {{ host }}.</p>`,
    ].join("\n"),
  );

  assert.deepEqual(findLiveRegionViolations("QueueView.vue", content), []);
});

// A void element written without `/>` is valid HTML and has no closing tag to
// find. Counting tag names ran its region to the end of the file, so the
// sentence below it was read as spoken text — the wrong rule, with the wrong
// advice attached.
test("rule 5 ends a void region at its own tag, even without a slash", () => {
  const content = sfc(
    "",
    [
      `  <img class="sr-only" src="/cover.jpg" alt="">`,
      `  <p>Signalform is connected to {{ host }}.</p>`,
    ].join("\n"),
  );

  assert.deepEqual(findLiveRegionViolations("QueueView.vue", content), []);
});

test("rule 5 ignores a comment inside a region", () => {
  const content = sfc(
    "",
    [
      `  <div aria-live="polite">`,
      `    <!-- Announced only while a drag is in progress -->`,
      `    {{ dragOverlayLabel }}`,
      `  </div>`,
    ].join("\n"),
  );

  assert.deepEqual(findLiveRegionViolations("QueueView.vue", content), []);
});

test("rule 5 stays out of the script block", () => {
  const content = sfc(
    `const srOnly = 'sr-only'\nconst hint = 'Now playing announcement'`,
    `  <div :class="srOnly" aria-live="polite">{{ hint }}</div>`,
  );

  assert.deepEqual(findLiveRegionViolations("Panel.vue", content), []);
});

// Rule 6 — the visible half of the template. The "flags" cases are the seven
// strings that survived the translation pass in files it had already edited;
// the "accepts" cases are the reason the rule can afford a one-word bar, since
// a template is mostly markup, glyphs and interpolations and none of that may
// reach the report.

test("rule 6 flags an English sentence in visible markup", () => {
  const violations = findVisibleTextViolations(
    "SetupWizardView.vue",
    sfc("", `  <p>Signalform is connected to {{ selectedHost }}.</p>`),
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 6);
  assert.match(violations[0].expression, /"is connected to"/);
});

test("rule 6 flags a single word beside an interpolation or a glyph", () => {
  const content = sfc(
    "",
    [
      `  <p data-testid="album-track-count">{{ album.tracks.length }} tracks</p>`,
      `  <span>{{ artist.listeners }} listeners · {{ artist.plays }}</span>`,
      `  <span>+ Queue</span>`,
      `  <span>✓ configured</span>`,
      `  <span class="rounded-full px-2">online</span>`,
    ].join("\n"),
  );

  assert.deepEqual(
    findVisibleTextViolations("AlbumDetailView.vue", content).map(
      (violation) => `${violation.line}:${violation.expression}`,
    ),
    [
      `6:"tracks" (visible text in the template)`,
      `7:"listeners" (visible text in the template)`,
      `8:"Queue" (visible text in the template)`,
      `9:"configured" (visible text in the template)`,
      `10:"online" (visible text in the template)`,
    ],
  );
});

test("rule 6 accepts a template of t() calls, data and glyphs", () => {
  const content = sfc(
    "",
    [
      `  <h1>{{ t('queue.title') }}</h1>`,
      `  <p>{{ album.title }} — {{ album.artist }}</p>`,
      `  <span>{{ listeners }} · {{ plays }}</span>`,
      `  <span>{{ count }} × 1996</span>`,
      `  <span>{{ t('library.decade') }}: 2010s</span>`,
      `  <span>Signalform v{{ version }}</span>`,
      `  <span>Tidal</span>`,
    ].join("\n"),
  );

  assert.deepEqual(findVisibleTextViolations("LibraryView.vue", content), []);
});

// Both cases the rule found on the current tree. A link labelled with its own
// address is not prose, and no allowlist of URLs is needed to say so.
test("rule 6 accepts link text that repeats its own href", () => {
  const content = sfc(
    "",
    [
      `  <a`,
      `    href="https://www.last.fm/api/account/create"`,
      `    target="_blank"`,
      `    >last.fm/api/account/create</a`,
      `  >.`,
      `  <a href="https://fanart.tv/profile/">fanart.tv/profile</a>`,
    ].join("\n"),
  );

  assert.deepEqual(
    findVisibleTextViolations("SetupWizardView.vue", content),
    [],
  );
});

test("rule 6 flags prose inside a link all the same", () => {
  const content = sfc(
    "",
    [
      `  <a href="https://fanart.tv/profile/">Get your key here</a>`,
      `  <a :href="downloadLink">download</a>`,
    ].join("\n"),
  );

  assert.deepEqual(
    findVisibleTextViolations("SetupWizardView.vue", content).map(
      (violation) => violation.expression,
    ),
    [
      `"Get your key here" (visible text in the template)`,
      `"download" (visible text in the template)`,
    ],
  );
});

test("rule 6 leaves the spoken regions to rule 5", () => {
  const content = sfc(
    "",
    [
      `  <span class="sr-only">Loading</span>`,
      `  <div role="status" aria-live="polite">Now playing: {{ title }}</div>`,
    ].join("\n"),
  );

  assert.deepEqual(findVisibleTextViolations("Spinner.vue", content), []);
  assert.equal(findLiveRegionViolations("Spinner.vue", content).length, 2);
});

// Cutting a spoken region out must not take the sentence beside it along.
test("rule 6 still reads the visible text around a spoken region", () => {
  const violations = findVisibleTextViolations(
    "LibraryView.vue",
    sfc(
      "",
      `  <p>Nothing here yet<span class="sr-only">Empty library</span>reload soon</p>`,
    ),
  );

  assert.deepEqual(
    violations.map((violation) => violation.expression),
    [
      `"Nothing here yet" (visible text in the template)`,
      `"reload soon" (visible text in the template)`,
    ],
  );
});

// The dangerous half of the same defect: the spoken span cut out of the
// template swallowed the rest of the file, and rule 6 fell silent for every
// visible string after it without anyone noticing.
test("rule 6 keeps reading after a void element carrying sr-only", () => {
  const content = sfc(
    "",
    [
      `  <img class="sr-only" src="/cover.jpg" alt="">`,
      `  <p>Signalform is connected to {{ selectedHost }}.</p>`,
      `  <span>+ Queue</span>`,
    ].join("\n"),
  );

  assert.deepEqual(
    findVisibleTextViolations("SetupWizardView.vue", content).map(
      (violation) => `${violation.line}:${violation.expression}`,
    ),
    [
      `7:"is connected to" (visible text in the template)`,
      `8:"Queue" (visible text in the template)`,
    ],
  );
});

test("rule 6 reads text nodes, not attributes, comments or the script block", () => {
  const content = sfc(
    `const emptyLabel = 'Nothing to play yet'`,
    [
      `  <div`,
      `    :title="t('queue.dropHint')"`,
      `    data-testid="queue-empty"`,
      `    placeholder="Search albums"`,
      `    @click="() => close()"`,
      `  >`,
      `    <!-- Shown until the first track arrives -->`,
      `    {{ emptyLabel }}`,
      `  </div>`,
    ].join("\n"),
  );

  assert.deepEqual(findVisibleTextViolations("QueueView.vue", content), []);
});
