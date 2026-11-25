import { SceneHost, type SceneProps } from "../engine/SceneHost";
import { loadBrainMap, type BrainMapData } from "../data";
import { createBrainMap } from "./model";

/**
 * The Wattness Terminal's architecture as six stacked layers, with Living
 * Brain's pages above it, each tied down to the part it describes.
 */
export default function BrainMap(props: SceneProps) {
  return (
    <SceneHost
      {...props}
      defaultName="brain-map"
      label="Brain map: the Wattness Terminal's six layers and its parts, with Living Brain's pages about each part above them."
      load={loadBrainMap}
      create={createBrainMap}
      fallback={(data) => <BrainStill data={data} />}
    />
  );
}

function BrainStill({ data }: { data: BrainMapData | null }) {
  if (!data) return null;
  const { structure, memory } = data;
  return (
    <div style={{ display: "grid", gap: 12, width: "min(560px, 100%)", fontSize: 13 }}>
      {[...structure.layers]
        .map((name, l) => ({ name, l, parts: structure.nodes.filter((n) => n.layer === l) }))
        .reverse()
        .map(({ name, l, parts }) => (
          <div key={name} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ color: "var(--muted)", fontSize: 11 }}>
              {String(l + 1).padStart(2, "0")} {name}
            </div>
            <div>{parts.map((p) => p.short).join(" · ")}</div>
          </div>
        ))}
      {memory && (
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          Living Brain, “{memory.brain}”: {memory.counts.pages} pages and {memory.counts.connections} connections.
        </div>
      )}
    </div>
  );
}
