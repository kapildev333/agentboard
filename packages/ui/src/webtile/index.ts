import type { WebTileNode } from "@agentboard/shared";

export { WebTileView } from "./WebTileView";

export const webtileAdds = [
  {
    label: "Web tile",
    create: (p: { x: number; y: number }): WebTileNode => ({
      id: crypto.randomUUID(),
      type: "webtile",
      title: "Web tile",
      x: p.x,
      y: p.y,
      w: 480,
      h: 360,
      url: "http://localhost:3000",
    }),
  },
];
