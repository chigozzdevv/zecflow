import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  Handle,
  Position,
} from "reactflow";
import type { Connection, Edge, Node, NodeProps, ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { authorizedRequest, ApiError } from "@/lib/api-client";

type WorkflowItem = {
  _id: string;
  name: string;
  status: "draft" | "published" | "paused";
  createdAt?: string;
};

type BlockItem = {
  _id: string;
  type: string;
  config?: Record<string, unknown>;
  order?: number;
  alias?: string;
  connector?: string;
  dependencies?: string[];
  createdAt?: string;
};

type BlockCategory = "input" | "compute" | "action" | "storage" | "transform";

type BlockDefinition = {
  id: string;
  name: string;
  description: string;
  category: BlockCategory;
  handler: "logic" | "nillion" | "nilai" | "zcash" | "connector";
  requiresConnector?: boolean;
};

type ListWorkflowsResponse = {
  workflows: WorkflowItem[];
};

type ListBlocksResponse = {
  blocks: BlockItem[];
};

type BlockDefinitionsResponse = {
  blocks: BlockDefinition[];
};

type CreateBlockResponse = {
  block: BlockItem;
};

const BLOCK_CONFIG_TEMPLATES: Record<string, Record<string, unknown>> = {
  "payload-input": {
    path: "payload",
    alias: "payload",
  },
  "json-extract": {
    source: "payload",
    path: "payload.amount",
    alias: "amount",
  },
  "memo-parser": {
    sourcePath: "payload.memo",
    delimiter: ":",
    alias: "memo",
  },
  "nillion-compute": {
    workloadId: "WORKLOAD_ID",
    inputPath: "payload",
    alias: "computeResult",
  },
  "nillion-block-graph": {
    nillionGraph: { nodes: [], edges: [] },
    inputMapping: {},
    alias: "nillionGraph",
  },
  "nilai-llm": {
    promptTemplate: "Explain {{payload.amount}}",
    alias: "analysis",
  },
  "zcash-send": {
    amountPath: "payload.amount",
    addressPath: "payload.address",
    memoPath: "payload.memo",
    fallbackAddress: "",
    fallbackFromAddress: "",
    privacyPolicy: "FullPrivacy",
  },
  "connector-request": {
    relativePath: "/",
    method: "POST",
    bodyPath: "payload",
    responseAlias: "connectorResponse",
    headers: {
      "x-api-key": "secret",
    },
  },
  "custom-http-action": {
    url: "https://api.example.com/path",
    method: "POST",
    bodyPath: "payload",
    responseAlias: "httpResponse",
    headers: {
      "x-api-key": "secret",
    },
  },
  "state-store": {
    collectionId: "zecflow-state",
    keyPath: "payload.userId",
    dataPath: "payload",
    encryptAll: true,
    encryptFields: [],
    alias: "stored",
  },
  "state-read": {
    collectionId: "zecflow-state",
    keyPath: "payload.userId",
    alias: "state",
  },
  "math-add": {
    aPath: "payload.a",
    bPath: "payload.b",
    alias: "sum",
  },
  "math-subtract": {
    aPath: "payload.a",
    bPath: "payload.b",
    alias: "difference",
  },
  "math-multiply": {
    aPath: "payload.a",
    bPath: "payload.b",
    alias: "product",
  },
  "math-divide": {
    aPath: "payload.a",
    bPath: "payload.b",
    alias: "quotient",
  },
  "math-greater-than": {
    aPath: "payload.a",
    bPath: "payload.b",
    alias: "isGreater",
  },
  "logic-if-else": {
    conditionPath: "payload.condition",
    truePath: "payload.trueValue",
    falsePath: "payload.falseValue",
    alias: "selected",
  },
};

type WorkflowNodeData = {
  label: string;
  blockType: string;
  onDelete: (id: string) => void;
};

function WorkflowNode({ id, data }: NodeProps<WorkflowNodeData>) {
  return (
    <div className="relative rounded-xl border border-white/15 bg-zinc-900/95 px-3 py-2 text-xs text-white shadow-sm">
      {data.blockType === "logic-if-else" ? (
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
        </>
      ) : data.blockType.startsWith("math-") ? (
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
        </>
      ) : (
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 bg-zinc-500 border-none" />
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 bg-[#6758c1] border-none" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate max-w-[140px]">{data.label}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete(id);
          }}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[10px] text-zinc-300 hover:bg-red-500 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function DashboardWorkflowPage() {
  const location = useLocation();
  const initialWorkflowIdFromState =
    ((location.state as { workflowId?: string } | null | undefined)?.workflowId as string | undefined) ?? "";
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(initialWorkflowIdFromState);
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [definitions, setDefinitions] = useState<BlockDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      try {
        setLoading(true);
        setError(null);
        const [wfRes, defRes] = await Promise.all([
          authorizedRequest<ListWorkflowsResponse>("/workflows"),
          authorizedRequest<BlockDefinitionsResponse>("/blocks/definitions"),
        ]);
        if (cancelled) return;
        const wfList = (wfRes.workflows ?? []).slice().sort((a, b) => {
          const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
          const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
          return bTime - aTime;
        });
        setWorkflows(wfList);
        const defs = defRes.blocks ?? [];
        setDefinitions(defs);
        if (wfList.length > 0) {
          const fromState = initialWorkflowIdFromState;
          if (fromState && wfList.some((w) => w._id === fromState)) {
            setSelectedWorkflowId(fromState);
          } else if (!selectedWorkflowId) {
            setSelectedWorkflowId(wfList[0]._id);
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        setError("We couldn't load workflows and blocks.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [initialWorkflowIdFromState, selectedWorkflowId]);

  const handleDeleteNode = useCallback(
    async (id: string) => {
      try {
        await authorizedRequest<void>(`/blocks/${encodeURIComponent(id)}`, { method: "DELETE" });
        setBlocks((prev) => prev.filter((b) => b._id !== id));
        setNodes((nds) => nds.filter((n) => n.id !== id));
        setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      } catch (err) {
        if (err instanceof ApiError && err.message) {
          setBlocksError(err.message);
        } else {
          setBlocksError("Failed to delete block.");
        }
      }
    },
    [setBlocks, setNodes, setEdges],
  );

  useEffect(() => {
    if (!selectedWorkflowId) {
      setBlocks([]);
      setNodes([]);
      setEdges([]);
      return;
    }

    let cancelled = false;

    async function loadBlocks() {
      try {
        setBlocksLoading(true);
        setBlocksError(null);
        const res = await authorizedRequest<ListBlocksResponse>(
          `/blocks?workflowId=${encodeURIComponent(selectedWorkflowId)}`,
        );
        if (cancelled) return;
        const list = res.blocks ?? [];
        setBlocks(list);

        const newNodes: Node<WorkflowNodeData>[] = list.map((block, index) => {
          const def = definitions.find((d) => d.id === block.type);
          const label = block.alias || def?.name || block.type;
          const baseX = 120 + (index % 4) * 220;
          const baseY = 80 + Math.floor(index / 4) * 140;
          const position = { x: baseX, y: baseY };
          return {
            id: block._id,
            position,
            data: {
              label,
              blockType: block.type,
              onDelete: handleDeleteNode,
            },
            type: "workflow",
          };
        });

        const newEdges: Edge[] = [];
        for (const block of list) {
          if (!block.dependencies || !block.dependencies.length) continue;
          for (const dep of block.dependencies) {
            const source = String(dep);
            const target = block._id;
            newEdges.push({
              id: `${source}-${target}`,
              source,
              target,
              type: "smoothstep",
            });
          }
        }

        setNodes(newNodes);
        setEdges(newEdges);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        setBlocksError("We couldn't load blocks for this workflow.");
      } finally {
        if (!cancelled) {
          setBlocksLoading(false);
        }
      }
    }

    loadBlocks();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkflowId, definitions, setEdges, setNodes, handleDeleteNode]);

  const selectedWorkflow = workflows.find((w) => w._id === selectedWorkflowId) || null;

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const targetBlock = blocks.find((b) => b._id === connection.target);
      if (!targetBlock) return;

      const existingDeps = targetBlock.dependencies ?? [];
      const newDeps = existingDeps.includes(connection.source)
        ? existingDeps
        : [...existingDeps, connection.source];

      const prevConfig = (targetBlock.config ?? {}) as Record<string, unknown>;
      const prevSlots = (prevConfig.__inputSlots as Record<string, { source: string; output?: string }> | undefined) ?? {};

      let slotKey = connection.targetHandle || undefined;

      if (!slotKey && targetBlock.type.startsWith("math-")) {
        const preferred = ["a", "b"];
        slotKey = preferred.find((key) => !prevSlots[key]) ?? undefined;
      } else if (!slotKey && targetBlock.type === "logic-if-else") {
        const preferred = ["condition", "true", "false"];
        slotKey = preferred.find((key) => !prevSlots[key]) ?? undefined;
      }

      const nextConfig: Record<string, unknown> = {
        ...prevConfig,
        __inputSlots: {
          ...prevSlots,
          ...(slotKey
            ? {
                [slotKey]: {
                  source: connection.source,
                  output: connection.sourceHandle || undefined,
                },
              }
            : {}),
        },
      };

      try {
        const res = await authorizedRequest<CreateBlockResponse>(`/blocks/${connection.target}`, {
          method: "PATCH",
          body: JSON.stringify({ dependencies: newDeps, config: nextConfig }),
        });
        const updatedBlock = res.block;
        setBlocks((prev) => prev.map((b) => (b._id === updatedBlock._id ? updatedBlock : b)));
        setEdges((eds) => addEdge({ ...connection, type: "smoothstep" }, eds));
      } catch {
        // ignore for now
      }
    },
    [blocks, setEdges],
  );

  const onDragStartBlock = (event: React.DragEvent<HTMLButtonElement>, type: string) => {
    event.dataTransfer.setData("application/reactflow", type);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleAddBlock = useCallback(
    async (type: string) => {
      if (!selectedWorkflowId) return;

      const position = reactFlowInstance
        ? reactFlowInstance.project({ x: 420, y: 220 })
        : { x: 160 + nodes.length * 40, y: 160 };

      const template = BLOCK_CONFIG_TEMPLATES[type] ?? {};
      const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
      const dependencies = selectedIds.length === 1 ? [selectedIds[0]] : [];

      try {
        const res = await authorizedRequest<CreateBlockResponse>("/blocks", {
          method: "POST",
          body: JSON.stringify({
            workflowId: selectedWorkflowId,
            type,
            config: template,
            order: blocks.length + 1,
            alias: undefined,
            dependencies,
          }),
        });

        const newBlock = res.block;
        setBlocks((prev) => [...prev, newBlock]);
        const def = definitions.find((d) => d.id === newBlock.type);
        const label = newBlock.alias || def?.name || newBlock.type;

        setNodes((nds) =>
          nds.concat({
            id: newBlock._id,
            position,
            data: {
              label,
              blockType: newBlock.type,
              onDelete: handleDeleteNode,
            },
            type: "workflow",
          }),
        );

        if (dependencies.length === 1) {
          const sourceId = dependencies[0];
          setEdges((eds) =>
            addEdge(
              {
                id: `${sourceId}-${newBlock._id}`,
                source: sourceId,
                target: newBlock._id,
                type: "smoothstep",
              },
              eds,
            ),
          );
        }
      } catch {
        // ignore for now
      }
    },
    [selectedWorkflowId, reactFlowInstance, nodes, blocks, definitions, handleDeleteNode, setBlocks, setNodes, setEdges],
  );

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowInstance || !selectedWorkflowId) return;

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const template = BLOCK_CONFIG_TEMPLATES[type] ?? {};
      const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
      const dependencies = selectedIds.length === 1 ? [selectedIds[0]] : [];

      try {
        const res = await authorizedRequest<CreateBlockResponse>("/blocks", {
          method: "POST",
          body: JSON.stringify({
            workflowId: selectedWorkflowId,
            type,
            config: template,
            order: blocks.length + 1,
            alias: undefined,
            dependencies,
          }),
        });

        const newBlock = res.block;
        setBlocks((prev) => [...prev, newBlock]);
        const def = definitions.find((d) => d.id === newBlock.type);
        const label = newBlock.alias || def?.name || newBlock.type;

        setNodes((nds) =>
          nds.concat({
            id: newBlock._id,
            position,
            data: {
              label,
              blockType: newBlock.type,
              onDelete: handleDeleteNode,
            },
            type: "workflow",
          }),
        );

        if (dependencies.length === 1) {
          const sourceId = dependencies[0];
          setEdges((eds) =>
            addEdge(
              {
                id: `${sourceId}-${newBlock._id}`,
                source: sourceId,
                target: newBlock._id,
                type: "smoothstep",
              },
              eds,
            ),
          );
        }
      } catch {
        // ignore for now
      }
    },
    [reactFlowInstance, selectedWorkflowId, nodes, blocks, definitions, handleDeleteNode, setEdges, setNodes],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Workflow builder</h2>
          <p className="text-sm text-zinc-300 max-w-xl">Connect triggers, blocks, and Zcash or Nillion actions.</p>
        </div>
        {workflows.length > 0 && (
          <div className="space-y-1 text-sm">
            <div className="text-xs text-zinc-400">Workflow</div>
            <select
              value={selectedWorkflowId}
              onChange={(e) => setSelectedWorkflowId(e.target.value)}
              className="w-60 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
            >
              {workflows.map((wf) => (
                <option key={wf._id} value={wf._id}>
                  {wf.name} {wf.status === "published" ? "(published)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-sm text-zinc-300">You have no workflows yet.</p>
          <p className="text-xs text-zinc-500">Create a workflow first, then blocks will show up here.</p>
        </div>
      ) : blocksLoading ? (
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-white/30 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {blocksError && (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {blocksError}
            </div>
          )}
          {selectedWorkflow && (
            <div className="text-xs text-zinc-400">
              Showing blocks for <span className="text-zinc-200">{selectedWorkflow.name}</span>
            </div>
          )}
          {selectedWorkflow && (
            <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-4 space-y-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">Workflow canvas</h3>
                  <p className="text-xs text-zinc-400">Click or drag blocks into the canvas and connect them.</p>
                </div>
              </div>
              <div
                ref={reactFlowWrapper}
                className="h-96 rounded-2xl border border-white/12 bg-black flex overflow-hidden"
              >
                <div className="w-56 border-r border-white/10 p-3 space-y-2 overflow-y-auto">
                  <div className="text-xs font-semibold text-zinc-300 mb-1">Blocks</div>
                  {definitions
                    .filter((def) => def.id !== "nillion-block-graph")
                    .map((def) => (
                      <button
                        key={def.id}
                        type="button"
                        draggable
                        onDragStart={(e) => onDragStartBlock(e, def.id)}
                        onClick={() => handleAddBlock(def.id)}
                        className="w-full text-left rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-200 hover:border-white/30 hover:bg-white/5"
                      >
                        <div className="font-medium text-[11px]">{def.name}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{def.description}</div>
                      </button>
                    ))}
                </div>
                <div className="flex-1">
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onInit={setReactFlowInstance}
                    fitView
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                  >
                    <Background id="zecflow-builder-bg" variant="dots" gap={22} size={1} color="#27272a" />
                    <MiniMap nodeColor="#4f46e5" nodeBorderRadius={4} />
                    <Controls />
                  </ReactFlow>
                </div>
              </div>
            </div>
          )}
          {blocks.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/20 bg-zinc-900/70 p-6 flex flex-col items-center justify-center text-center gap-2">
              <p className="text-sm text-zinc-300">No blocks in this workflow yet.</p>
              <p className="text-xs text-zinc-500">
                Click a block on the left or drag it into the canvas to start your flow.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
