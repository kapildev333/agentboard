import type { NodeProps } from "@xyflow/react";
import type { ImageNode } from "@agentboard/shared";

export function ImageView(props: NodeProps) {
  const node = (props.data as { node: ImageNode }).node;
  return (
    <img
      src={`/api/assets/${node.assetId}`}
      alt={node.alt}
      width={node.w}
      height={node.h}
      draggable={false}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
    />
  );
}
