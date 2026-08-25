export type TagQueryMode = "format" | "text";

export type TagDescriptor = {
  readonly id: string;
  readonly label: string;
  readonly mode: TagQueryMode;
  readonly term: string;
};

export const TAG_VOCABULARY: readonly TagDescriptor[] = [
  { id: "sacd", label: "SACD", mode: "format", term: "SACD" },
  { id: "hdcd", label: "HDCD", mode: "format", term: "HDCD" },
  {
    id: "quadraphonic",
    label: "Quadraphonic",
    mode: "format",
    term: "Quadraphonic",
  },
  {
    id: "multichannel",
    label: "Multichannel",
    mode: "format",
    term: "Multichannel",
  },
  { id: "ambisonic", label: "Ambisonic", mode: "format", term: "Ambisonic" },
  { id: "qsound", label: "QSound", mode: "text", term: "qsound" },
  {
    id: "dolby-atmos",
    label: "Dolby Atmos",
    mode: "text",
    term: "dolby atmos",
  },
  {
    id: "half-speed-mastered",
    label: "Half-Speed Mastered",
    mode: "text",
    term: "half-speed mastered",
  },
  {
    id: "mobile-fidelity",
    label: "Mobile Fidelity",
    mode: "text",
    term: "mobile fidelity",
  },
];

export const findTag = (id: string): TagDescriptor | undefined => {
  const normalised = id.trim().toLowerCase();
  return TAG_VOCABULARY.find((tag) => tag.id === normalised);
};
