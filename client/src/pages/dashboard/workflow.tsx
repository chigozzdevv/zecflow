import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useEdgesState,
  useNodesState,
  Handle,
  Position,
} from "reactflow";
import type { Connection, Edge, Node, NodeProps, ReactFlowInstance, NodeChange } from "reactflow";
import "reactflow/dist/style.css";
import { authorizedRequest, ApiError } from "@/lib/api-client";

type WorkflowItem = {
  _id: string;
  name: string;
  status: "draft" | "published" | "paused";
  createdAt?: string;
};

type BlockDependency = {
  source: string;
  targetHandle?: string;
  sourceHandle?: string;
};

type SerializedDependency = BlockDependency | string;

type RawBlockItem = {
  _id: string;
  type: string;
  config?: Record<string, unknown>;
  order?: number;
  alias?: string;
  connector?: string;
  dependencies?: SerializedDependency[];
  createdAt?: string;
  position?: { x: number; y: number } | null;
};

type BlockItem = Omit<RawBlockItem, "dependencies"> & {
  dependencies?: BlockDependency[];
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
  blocks: RawBlockItem[];
};

type BlockDefinitionsResponse = {
  blocks: BlockDefinition[];
};

type CreateBlockResponse = {
  block: RawBlockItem;
};

const normalizeDependencies = (deps?: SerializedDependency[]): BlockDependency[] => {
  if (!deps) return [];
  return deps
    .map((dep) => {
      if (!dep) return null;
      if (typeof dep === "string") return { source: dep };
      if (typeof dep.source === "string" && dep.source.length) {
        return { source: dep.source, targetHandle: dep.targetHandle, sourceHandle: dep.sourceHandle };
      }
      return null;
    })
    .filter((dep): dep is BlockDependency => dep !== null);
};

const normalizeBlockItem = (block: RawBlockItem): BlockItem => ({
  ...block,
  dependencies: normalizeDependencies(block.dependencies),
});

type PublishWorkflowResponse = {
  workflow: WorkflowItem;
  integrationSnippet?: string;
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
  const navigate = useNavigate();
  const initialWorkflowIdFromState =
    ((location.state as { workflowId?: string } | null | undefined)?.workflowId as string | undefined) ?? "";
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(initialWorkflowIdFromState);
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const blocksRef = useRef<BlockItem[]>([]);
  const [definitions, setDefinitions] = useState<BlockDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [nodes, setNodes, reactFlowOnNodesChange] = useNodesState<WorkflowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), []);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

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
        const normalized = list.map(normalizeBlockItem);
        setBlocks(normalized);

        const newNodes: Node<WorkflowNodeData>[] = normalized.map((block, index) => {
          const def = definitions.find((d) => d.id === block.type);
          const label = block.alias || def?.name || block.type;
          const baseX = 120 + (index % 4) * 220;
          const baseY = 80 + Math.floor(index / 4) * 140;
          const persistedPosition = block.position;
          const position =
            persistedPosition && typeof persistedPosition.x === "number" && typeof persistedPosition.y === "number"
              ? persistedPosition
              : { x: baseX, y: baseY };
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
        for (const block of normalized) {
          const deps = normalizeDependencies(block.dependencies);
          if (!deps.length) continue;
          const cfg = (block.config ?? {}) as Record<string, unknown>;
          const inputSlots = (cfg.__inputSlots ?? {}) as Record<string, { source: string; output?: string }>;
          const sourceToHandle: Record<string, string> = {};
          for (const [handle, slot] of Object.entries(inputSlots)) {
            if (slot?.source) {
              sourceToHandle[slot.source] = handle;
            }
          }
          
          for (const dep of deps) {
            const source = dep.source;
            const target = block._id;
            const targetHandle = dep.targetHandle ?? (sourceToHandle[source] ?? undefined);
            const sourceHandle = dep.sourceHandle ?? (targetHandle ? inputSlots[targetHandle]?.output : undefined);
            newEdges.push({
              id: `${source}-${target}${targetHandle ? `-${targetHandle}` : ""}`,
              source,
              target,
              sourceHandle,
              targetHandle,
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

  const handlePublishWorkflow = useCallback(async () => {
    if (!selectedWorkflow) return;
    try {
      setPublishing(true);
      setPublishError(null);
      const res = await authorizedRequest<PublishWorkflowResponse>(
        `/workflows/${encodeURIComponent(selectedWorkflow._id)}/publish`,
        { method: "POST" },
      );
      const updated = res.workflow;
      setWorkflows((prev) => prev.map((w) => (w._id === updated._id ? updated : w)));
      navigate("/dashboard/workflows", { state: { integrationSnippet: res.integrationSnippet } });
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setPublishError(err.message);
      } else {
        setPublishError("Failed to publish workflow.");
      }
    } finally {
      setPublishing(false);
    }
  }, [selectedWorkflow, navigate]);

  const selectedBlock = useMemo(
    () => (selectedBlockId ? blocks.find((b) => b._id === selectedBlockId) ?? null : null),
    [blocks, selectedBlockId],
  );

  useEffect(() => {
    if (!selectedBlock) {
      setConfigForm({});
      setConfigError(null);
      return;
    }
    const cfg = (selectedBlock.config ?? {}) as Record<string, unknown>;
    const asString = (v: unknown): string => (typeof v === "string" ? v : "");
    if (selectedBlock.type === "payload-input") {
      setConfigForm({
        path: asString(cfg.path),
        alias: asString(selectedBlock.alias),
      });
    } else if (selectedBlock.type === "json-extract") {
      setConfigForm({
        source: asString(cfg.source) || "payload",
        path: asString(cfg.path),
        alias: asString(selectedBlock.alias),
      });
    } else if (selectedBlock.type === "connector-request") {
      setConfigForm({
        relativePath: asString(cfg.relativePath) || "/",
        method: asString(cfg.method) || "POST",
        bodyPath: asString(cfg.bodyPath),
        responseAlias: asString(cfg.responseAlias),
        alias: asString(selectedBlock.alias),
      });
    } else if (selectedBlock.type === "nilai-llm") {
      setConfigForm({
        promptTemplate: asString(cfg.promptTemplate),
        alias: asString(selectedBlock.alias),
      });
    } else if (selectedBlock.type === "logic-if-else") {
      setConfigForm({
        conditionPath: asString(cfg.conditionPath),
        truePath: asString(cfg.truePath),
        falsePath: asString(cfg.falsePath),
        alias: asString(selectedBlock.alias),
      });
    } else if (selectedBlock.type.startsWith("math-")) {
      setConfigForm({
        aPath: asString(cfg.aPath),
        bPath: asString(cfg.bPath),
        alias: asString(selectedBlock.alias),
      });
    } else {
      setConfigForm({ alias: asString(selectedBlock.alias) });
    }
    setConfigError(null);
  }, [selectedBlock]);

  const handleSaveConfig = useCallback(async () => {
    if (!selectedBlock) return;
    try {
      setConfigSaving(true);
      setConfigError(null);
      const prevCfg = (selectedBlock.config ?? {}) as Record<string, unknown>;
      const nextCfg: Record<string, unknown> = { ...prevCfg };

      if (selectedBlock.type === "payload-input") {
        nextCfg.path = configForm.path?.trim() || "payload";
      } else if (selectedBlock.type === "json-extract") {
        nextCfg.source = (configForm.source || "payload").trim();
        nextCfg.path = configForm.path?.trim() || "";
      } else if (selectedBlock.type === "connector-request") {
        nextCfg.relativePath = configForm.relativePath?.trim() || "/";
        nextCfg.method = (configForm.method || "POST").trim() || "POST";
        nextCfg.bodyPath = configForm.bodyPath?.trim() || undefined;
        nextCfg.responseAlias = configForm.responseAlias?.trim() || undefined;
      } else if (selectedBlock.type === "nilai-llm") {
        nextCfg.promptTemplate = configForm.promptTemplate?.trim() || "";
      } else if (selectedBlock.type === "logic-if-else") {
        nextCfg.conditionPath = configForm.conditionPath?.trim() || "";
        nextCfg.truePath = configForm.truePath?.trim() || "";
        nextCfg.falsePath = configForm.falsePath?.trim() || "";
      } else if (selectedBlock.type.startsWith("math-")) {
        nextCfg.aPath = configForm.aPath?.trim() || "";
        nextCfg.bPath = configForm.bPath?.trim() || "";
      }

      const alias = configForm.alias?.trim() || undefined;

      const res = await authorizedRequest<CreateBlockResponse>(`/blocks/${selectedBlock._id}`, {
        method: "PATCH",
        body: JSON.stringify({ config: nextCfg, alias }),
      });
      const updated = normalizeBlockItem(res.block);
      setBlocks((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
      setNodes((nds) =>
        nds.map((n) =>
          n.id === updated._id
            ? {
                ...n,
                data: {
                  ...n.data,
                  label: updated.alias || n.data.label,
                },
              }
            : n,
        ),
      );
      // Clear selection after successful save so the panel closes
      setSelectedBlockId(null);
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setConfigError(err.message);
      } else {
        setConfigError("Failed to save config.");
      }
    } finally {
      setConfigSaving(false);
    }
  }, [selectedBlock, configForm, setBlocks, setNodes]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const targetBlock = blocksRef.current.find((b) => b._id === connection.target);
      if (!targetBlock) return;

      const existingDeps = normalizeDependencies(targetBlock.dependencies);

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

      const nextConfigSlots = { ...prevSlots };
      if (slotKey) {
        nextConfigSlots[slotKey] = {
          source: connection.source,
          output: connection.sourceHandle || undefined,
        };
      }

      const filteredDeps = slotKey
        ? existingDeps.filter((dep) => dep.targetHandle !== slotKey)
        : existingDeps.filter((dep) => !(dep.source === connection.source && !dep.targetHandle));

      const dependencyEntry: BlockDependency = {
        source: connection.source,
        targetHandle: slotKey,
        sourceHandle: connection.sourceHandle || undefined,
      };

      const nextDeps = [...filteredDeps, dependencyEntry];

      const nextConfig: Record<string, unknown> = {
        ...prevConfig,
        __inputSlots: nextConfigSlots,
      };

      try {
        const res = await authorizedRequest<CreateBlockResponse>(`/blocks/${connection.target}`, {
          method: "PATCH",
          body: JSON.stringify({ dependencies: nextDeps, config: nextConfig }),
        });
        const updatedBlock = normalizeBlockItem(res.block);
        setBlocks((prev) => {
          const updated = prev.map((b) => (b._id === updatedBlock._id ? updatedBlock : b));
          blocksRef.current = updated;
          return updated;
        });
        setEdges((eds) => addEdge({ ...connection, type: "smoothstep" }, eds));
      } catch {
        // ignore for now
      }
    },
    [setEdges],
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
      const dependencies = selectedIds.length === 1 ? [{ source: selectedIds[0] }] : [];

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
            position,
          }),
        });

        const newBlock = normalizeBlockItem(res.block);
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
          const sourceId = dependencies[0].source;
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
      const dependencies = selectedIds.length === 1 ? [{ source: selectedIds[0] }] : [];

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
            position,
          }),
        });

        const newBlock = normalizeBlockItem(res.block);
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
          const sourceId = dependencies[0].source;
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

  const persistNodePosition = useCallback(
    async (blockId: string, position: { x: number; y: number }) => {
      try {
        const res = await authorizedRequest<CreateBlockResponse>(`/blocks/${encodeURIComponent(blockId)}`, {
          method: "PATCH",
          body: JSON.stringify({ position }),
        });
        const updated = normalizeBlockItem(res.block);
        setBlocks((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
      } catch (err) {
        if (err instanceof ApiError && err.message) {
          setBlocksError(err.message);
        } else {
          setBlocksError("Failed to update block position.");
        }
      }
    },
    [setBlocks, setBlocksError],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      reactFlowOnNodesChange(changes);
      changes.forEach((change) => {
        if (change.type === "position" && change.position && !change.dragging) {
          void persistNodePosition(change.id, change.position);
        }
      });
    },
    [reactFlowOnNodesChange, persistNodePosition],
  );

  return (
    <div className="space-y-3">
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
          {publishError && (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {publishError}
            </div>
          )}
          {selectedWorkflow && (
            <div className="rounded-2xl border border-white/8 bg-zinc-900/70 p-3 space-y-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-white">Builder</h3>
                </div>
                {workflows.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <select
                      value={selectedWorkflowId}
                      onChange={(e) => setSelectedWorkflowId(e.target.value)}
                      className="w-52 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
                    >
                      {workflows.map((wf) => (
                        <option key={wf._id} value={wf._id}>
                          {wf.name} {wf.status === "published" ? "(published)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handlePublishWorkflow}
                      disabled={publishing || !selectedWorkflow}
                      className="inline-flex items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-4 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
                    >
                      {publishing ? "Publishing…" : selectedWorkflow?.status === "published" ? "Republish" : "Publish"}
                    </button>
                  </div>
                )}
              </div>
              <div
                ref={reactFlowWrapper}
                className="h-[460px] rounded-2xl border border-white/12 bg-black flex overflow-hidden"
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
                <div className="flex-1 flex">
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onInit={setReactFlowInstance}
                    onNodeClick={(_, node) => setSelectedBlockId(node.id)}
                    fitView
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background
                      id="zecflow-builder-bg"
                      variant={BackgroundVariant.Dots}
                      gap={22}
                      size={1}
                      color="#6758c1"
                    />
                    <Controls />
                  </ReactFlow>
                  {selectedBlock && (
                    <div className="w-64 border-l border-white/10 p-3 space-y-2 bg-zinc-950/80">
                      <div className="text-xs font-semibold text-zinc-300 mb-1">Block config</div>
                      <div className="space-y-2 text-[11px] text-zinc-200">
                        <div className="font-medium">{selectedBlock.type}</div>
                        <div className="space-y-1">
                          <label className="block text-[11px] text-zinc-300">Alias</label>
                          <input
                            value={configForm.alias ?? ""}
                            onChange={(e) => setConfigForm((f) => ({ ...f, alias: e.target.value }))}
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                          />
                        </div>
                        {selectedBlock.type === "connector-request" && (
                          <>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">Relative path</label>
                              <input
                                value={configForm.relativePath ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, relativePath: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                                placeholder="/loan/result"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">Method</label>
                              <select
                                value={configForm.method ?? "POST"}
                                onChange={(e) => setConfigForm((f) => ({ ...f, method: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                              >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="PATCH">PATCH</option>
                                <option value="DELETE">DELETE</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">Body path</label>
                              <input
                                value={configForm.bodyPath ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, bodyPath: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                                placeholder="memory"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">Response alias</label>
                              <input
                                value={configForm.responseAlias ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, responseAlias: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                                placeholder="connectorResponse"
                              />
                            </div>
                          </>
                        )}
                        {selectedBlock.type === "nilai-llm" && (
                          <div className="space-y-1">
                            <label className="block text-[11px] text-zinc-300">Prompt template</label>
                            <textarea
                              value={configForm.promptTemplate ?? ""}
                              onChange={(e) => setConfigForm((f) => ({ ...f, promptTemplate: e.target.value }))}
                              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40 min-h-[80px]"
                              placeholder="Explain the loan decision using {{memory.loanRecord.result.income}}, {{memory.loanRecord.result.existingDebt}}, {{memory.loanRecord.result.requestedAmount}}, {{memory.dti.result}}, {{memory.approved.result}}"
                            />
                          </div>
                        )}
                        {selectedBlock.type === "payload-input" && (
                          <div className="space-y-1">
                            <label className="block text-[11px] text-zinc-300">Path</label>
                            <input
                              value={configForm.path ?? ""}
                              onChange={(e) => setConfigForm((f) => ({ ...f, path: e.target.value }))}
                              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                              placeholder="payload"
                            />
                          </div>
                        )}
                        {selectedBlock.type === "json-extract" && (
                          <>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">Source</label>
                              <select
                                value={configForm.source ?? "payload"}
                                onChange={(e) => setConfigForm((f) => ({ ...f, source: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                              >
                                <option value="payload">Payload</option>
                                <option value="memory">Memory</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">JSON path</label>
                              <input
                                value={configForm.path ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, path: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                                placeholder="payload.field"
                              />
                            </div>
                          </>
                        )}
                        {selectedBlock.type === "logic-if-else" && (
                          <>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">Condition path</label>
                              <input
                                value={configForm.conditionPath ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, conditionPath: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                                placeholder="payload.decision"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">True path</label>
                              <input
                                value={configForm.truePath ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, truePath: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">False path</label>
                              <input
                                value={configForm.falsePath ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, falsePath: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                              />
                            </div>
                          </>
                        )}
                        {selectedBlock.type.startsWith("math-") && (
                          <>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">aPath</label>
                              <input
                                value={configForm.aPath ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, aPath: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                                placeholder="payload.maxApprovedAmount"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[11px] text-zinc-300">bPath</label>
                              <input
                                value={configForm.bPath ?? ""}
                                onChange={(e) => setConfigForm((f) => ({ ...f, bPath: e.target.value }))}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] outline-none focus:border-[#6758c1] focus:ring-1 focus:ring-[#6758c1]/40"
                              />
                            </div>
                          </>
                        )}
                        {configError && (
                          <div className="text-[11px] text-red-400">{configError}</div>
                        )}
                        <button
                          type="button"
                          onClick={handleSaveConfig}
                          disabled={configSaving}
                          className="mt-2 w-full rounded border border-[#6758c1] bg-[#6758c1]/10 px-2 py-1 text-[11px] text-[#e0ddff] hover:bg-[#6758c1]/20 disabled:opacity-60"
                        >
                          {configSaving ? "Saving…" : "Save config"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
