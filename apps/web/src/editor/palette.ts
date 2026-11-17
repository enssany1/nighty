/** Notion-style colours offered for selected text. The API accepts only these values. */
export const TEXT_COLORS = [
  { name: "Gray", value: "#787774" },
  { name: "Orange", value: "#d9730d" },
  { name: "Yellow", value: "#cb912f" },
  { name: "Green", value: "#448361" },
  { name: "Blue", value: "#337ea9" },
  { name: "Purple", value: "#9065b0" },
  { name: "Red", value: "#d44c47" },
] as const;

export const BACKGROUND_COLORS = [
  { name: "Gray", value: "#f1f1ef" },
  { name: "Orange", value: "#fbecdd" },
  { name: "Yellow", value: "#fbf3db" },
  { name: "Green", value: "#edf3ec" },
  { name: "Blue", value: "#e7f3f8" },
  { name: "Purple", value: "#f4f0f7" },
  { name: "Red", value: "#fdebec" },
] as const;
