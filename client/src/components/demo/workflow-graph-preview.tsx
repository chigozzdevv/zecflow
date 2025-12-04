import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlowProvider,
} from "reactflow";
import type { Edge, Node, NodeProps } from "reactflow";
import "reactflow/dist/style.css";

export type WorkflowGraphNode = {
  id: string;
  alias?: string;
  blockId?: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
};

export type WorkflowGraphEdge = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type WorkflowGraphDefinition = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

type PreviewNodeData = {
  label: string;
  status: "completed" | "pending" | "idle";
  accent: string;
  blockType?: string;
};

function PreviewNode({ data }: NodeProps<PreviewNodeData>) {
  const isCompleted = data.status === "completed";
  const nodeClass =
    data.status === "pending"
      ? "border-zinc-700 bg-zinc-900 animate-pulse"
      : data.status === "idle"
        ? "border-zinc-800 bg-zinc-950"
        : "bg-opacity-10";

  return (
    <div
      className={`relative rounded-xl border px-3 py-2 text-xs text-white transition-colors ${nodeClass}`}
      style={
        isCompleted
          ? {
              borderColor: data.accent,
              backgroundColor: hexToRgba(data.accent, 0.08),
              boxShadow: `0 0 22px ${hexToRgba(data.accent, 0.45)}`,
            }
          : undefined
      }
    >
      {renderHandles(data.blockType)}
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${data.status === "pending" ? "bg-zinc-500" : "bg-zinc-700"}`}
          style={isCompleted ? { backgroundColor: data.accent } : undefined}
        />
        <span className="truncate max-w-[160px]">{data.label}</span>
      </div>
    </div>
  );
}

function renderHandles(blockType?: string) {
  if (blockType === "logic-if-else") {
    return (
      <>
        <Handle
          id="condition"
          type="target"
          position={Position.Left}
          style={{ top: 10 }}
          className="!h-2 !w-2 bg-zinc-500 border-none"
        />
        <Handle
          id="true"
          type="target"
          position={Position.Left}
          style={{ top: 22 }}
          className="!h-2 !w-2 bg-emerald-400 border-none"
        />
        <Handle
          id="false"
          type="target"
          position={Position.Left}
          style={{ top: 34 }}
          className="!h-2 !w-2 bg-rose-400 border-none"
        />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 bg-white/70 border-none" />
      </>
    );
  }

  if (blockType && blockType.startsWith("math-")) {
    return (
      <>
        <Handle
          id="a"
          type="target"
          position={Position.Left}
          style={{ top: 14 }}
          className="!h-2 !w-2 bg-zinc-500 border-none"
        />
        <Handle
          id="b"
          type="target"
          position={Position.Left}
          style={{ top: 30 }}
          className="!h-2 !w-2 bg-zinc-500 border-none"
        />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 bg-white/70 border-none" />
      </>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 bg-zinc-600 border-none" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 bg-white/70 border-none" />
    </>
  );
}

function hexToRgba(hex: string, alpha: number) {
  const sanitized = hex.replace("#", "");
  const bigint = Number.parseInt(sanitized, 16);
  if (Number.isNaN(bigint)) {
    return `rgba(103, 88, 193, ${alpha})`;
  }
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const nodeTypes = { preview: PreviewNode };

type WorkflowGraphPreviewProps = {
  title: string;
  description?: string;
  graph: WorkflowGraphDefinition | null;
  completedNodeIds?: string[];
  running?: boolean;
  accent?: "purple" | "emerald";
  height?: number;
  emptyMessage?: string;
};

const ACCENT_MAP: Record<string, string> = {
  purple: "#6758c1",
  emerald: "#10b981",
};

export function WorkflowGraphPreview({
  title,
  description,
  graph,
  completedNodeIds,
  running,
  accent = "purple",
  height = 220,
  emptyMessage,
}: WorkflowGraphPreviewProps) {
  const accentColor = ACCENT_MAP[accent] ?? ACCENT_MAP.purple;
  const [expanded, setExpanded] = useState(false);
  const completedSet = useMemo(() => new Set(completedNodeIds ?? []), [completedNodeIds]);

  const nodes = useMemo(() => buildNodes(graph, completedSet, running, accentColor), [graph, completedSet, running, accentColor]);
  const edges = useMemo(() => buildEdges(graph), [graph]);

  const inlineContent = graph ? (
    <GraphCanvas nodes={nodes} edges={edges} accentColor={accentColor} height={height} />
  ) : (
    <div className="flex h-[160px] items-center justify-center text-[11px] text-zinc-500">
      {emptyMessage || "Workflow graph is not available yet."}
    </div>
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {description && <p className="text-xs text-zinc-500">{description}</p>}
        </div>
        {graph && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-white/20 px-3 py-1 text-[11px] text-white hover:bg-white/10"
          >
            Expand
          </button>
        )}
      </div>
      {inlineContent}

      {expanded && graph && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Workflow Preview</p>
                <h4 className="text-lg font-semibold text-white">{title}</h4>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="flex-1 p-6">
              <GraphCanvas nodes={nodes} edges={edges} accentColor={accentColor} height={undefined} fullScreen />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type GraphCanvasProps = {
  nodes: Node<PreviewNodeData>[];
  edges: Edge[];
  accentColor: string;
  height?: number;
  fullScreen?: boolean;
};

function GraphCanvas({ nodes, edges, accentColor, height, fullScreen }: GraphCanvasProps) {
  return (
    <div className={fullScreen ? "h-full" : "rounded-2xl border border-white/10 bg-black"} style={height ? { height } : undefined}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll
          zoomOnPinch
          proOptions={{ hideAttribution: true }}
          className="rounded-2xl"
        >
          <Background id="demo-workflow-bg" variant={BackgroundVariant.Dots} gap={22} size={1} color={accentColor} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

function buildNodes(
  graph: WorkflowGraphDefinition | null,
  completedSet: Set<string>,
  running: boolean | undefined,
  accentColor: string,
): Node<PreviewNodeData>[] {
  const nodes = graph?.nodes ?? [];
  if (!nodes.length) {
    return [];
  }

  return nodes.map((node, idx) => {
    const id = node.id || `node-${idx}`;
    const label = node.alias || (typeof node.data?.label === 'string' ? node.data.label : node.blockId) || node.type || `Node ${idx + 1}`;
    const isCompleted = completedSet.has(id);
    const status: "completed" | "pending" | "idle" = isCompleted ? "completed" : running ? "pending" : "idle";
    const position = node.position ?? { x: (idx % 3) * 220, y: Math.floor(idx / 3) * 140 };

    return {
      id,
      position,
      data: {
        label,
        status,
        accent: accentColor,
        blockType: node.type,
      },
      type: "preview",
      draggable: false,
      selectable: false,
    } satisfies Node<PreviewNodeData>;
  });
}

function buildEdges(graph: WorkflowGraphDefinition | null): Edge[] {
  const edges = graph?.edges ?? [];
  if (!edges.length) {
    return [];
  }

  return edges.map((edge, idx) => ({
    id: edge.id ?? `edge-${idx}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: "smoothstep",
  }));
}
