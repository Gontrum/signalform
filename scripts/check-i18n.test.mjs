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
  findPlaceholderViolations,
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
  `    'queue.title': 'Queue',`,
  `  },`,
  `  de: {`,
  `    'home.viewArtist': 'Künstler {name} anzeigen',`,
  `    'home.addAlbumToQueue': 'Album {title} zur Warteschlange',`,
  `    'library.decadeScopeNotice': 'Nach Jahr, dann nach {sort}.',`,
  `    'queue.title': 'Warteschlange',`,
  `  },`,
  `}`,
].join("\n");

const PLACEHOLDER_KEYS = collectPlaceholderKeys(I18N_SOURCE);

test("collectPlaceholderKeys takes only keys whose message carries a placeholder", () => {
  assert.deepEqual([...PLACEHOLDER_KEYS].sort(), [
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
