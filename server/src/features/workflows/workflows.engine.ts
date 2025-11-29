import axios from 'axios';
import { Types } from 'mongoose';
import { WorkflowModel, WorkflowDocument } from './workflows.model';
import { RunModel } from '@/features/runs/runs.model';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { decryptConnectorConfig } from '@/features/connectors/connectors.security';
import { getBlockDefinition } from '@/features/blocks/blocks.registry';
import { nilccExecutionService } from '@/features/nillion-compute/nilcc-execution.service';
import { nilaiService } from '@/features/nillion-compute/nilai.service';
import { nildbService } from '@/features/nillion-compute/nildb.service';
import { zcashService, ZcashPrivacyPolicy } from '@/shared/services/zcash.service';
import { billingService } from '@/features/billing/billing.service';
import { logger } from '@/utils/logger';
import { WorkflowGraph, WorkflowNode, ExecutionContext, ExecutionStep, ExecutionResult } from './workflows.types';

type NilAIBlockResult = Awaited<ReturnType<typeof nilaiService.runInference>>;

type MemoryMap = Record<string, unknown>;

interface LeanConnector {
  _id: Types.ObjectId;
  type: string;
  config: Record<string, unknown>;
}

export class WorkflowEngine {
  async start(runId: string): Promise<void> {
    const run = await RunModel.findById(runId);
    if (!run) {
      return;
    }

    run.status = 'running';
    await run.save();

    let workflow: WorkflowDocument | null = null;
    let totalCost = 0;

    try {
      workflow = await WorkflowModel.findById(run.workflow);
      if (!workflow) {
        throw new Error('Workflow missing');
      }

      if (!workflow.graph || !workflow.graph.nodes || workflow.graph.nodes.length === 0) {
        throw new Error('Workflow graph is empty or missing');
      }

      // Calculate cost and check credits before execution
      const organizationId = workflow.organization.toString();
      totalCost = this.calculateWorkflowCost(workflow.graph);
      
      const creditCheck = await billingService.preflightCreditCheck(organizationId, totalCost);
      if (!creditCheck.hasEnough) {
        throw new Error(
          `Insufficient credits. Required: ${creditCheck.required}, Available: ${creditCheck.available}. ` +
          `Please add more credits to continue.`
        );
      }

      const result = await this.executeGraph(workflow.graph, run.payload, runId);

      // Deduct credits after successful execution
      await billingService.deductCredits(
        organizationId,
        totalCost,
        `Workflow run: ${workflow.name} (${runId})`
      );

      run.status = 'succeeded';
      run.result = {
        outputs: result.outputs,
        steps: result.steps,
        creditsUsed: totalCost,
      };
      await run.save();
    } catch (error) {
      logger.error({ err: error, runId }, 'Workflow execution failed');
      run.status = 'failed';
      run.result = { error: (error as Error).message };
      await run.save();
    }
  }

  /**
   * Calculate the total credit cost for a workflow based on its blocks
   */
  private calculateWorkflowCost(graph: WorkflowGraph): number {
    let cost = billingService.getCreditCost('workflow-run'); // Base cost for running a workflow

    for (const node of graph.nodes) {
      // Skip input/output nodes - they don't cost anything
      if (node.type === 'input' || node.type === 'output') {
        continue;
      }

      const blockId = node.blockId;
      if (!blockId) continue;

      // Map block IDs to operation types for billing
      if (blockId === 'nillion-compute') {
        cost += billingService.getCreditCost('nillion-compute');
      } else if (blockId === 'nillion-block-graph') {
        cost += billingService.getCreditCost('nillion-block-graph');
      } else if (blockId === 'nilai-llm') {
        cost += billingService.getCreditCost('nilai-llm');
      } else if (blockId === 'state-store') {
        cost += billingService.getCreditCost('state-store');
      } else if (blockId === 'state-read') {
        cost += billingService.getCreditCost('state-read');
      } else if (blockId === 'zcash-send') {
        cost += billingService.getCreditCost('zcash-send');
      } else if (blockId === 'connector-request') {
        cost += billingService.getCreditCost('connector-request');
      } else if (blockId === 'custom-http-action') {
        cost += billingService.getCreditCost('custom-http-action');
      } else if (
        blockId === 'math-add' ||
        blockId === 'math-subtract' ||
        blockId === 'math-multiply' ||
        blockId === 'math-divide' ||
        blockId === 'math-greater-than' ||
        blockId === 'logic-if-else'
      ) {
        cost += billingService.getCreditCost('nillion-math-logic');
      }
      // Logic blocks (payload-input, json-extract, memo-parser) are free
    }

    return cost;
  }

  private async executeGraph(
    graph: WorkflowGraph,
    payload: Record<string, unknown>,
    runId: string,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    this.validateGraph(graph);
    const executionOrder = this.topologicalSort(graph);

    const context: ExecutionContext = {
      values: new Map(),
    };

    const connectorMap = await this.loadConnectors(graph);
    const executionSteps: ExecutionStep[] = [];

    const inputNodes = graph.nodes.filter((n) => n.type === 'input');
    for (const inputNode of inputNodes) {
      const fieldName = inputNode.data?.fieldName || inputNode.alias || 'value';
      const value = this.getNestedValue(payload, fieldName);
      const key = `${inputNode.id}.value`;
      this.setContextValue(context, key, value);
      if (inputNode.alias) {
        this.setContextValue(context, `${inputNode.alias}.value`, value);
      }
    }

    const executedNodeIds = new Set<string>();
    for (const inputNode of inputNodes) {
      executedNodeIds.add(inputNode.id);
    }

    const nodeIndex = new Map<string, number>();
    executionOrder.forEach((id, idx) => nodeIndex.set(id, idx));

    for (let orderIdx = 0; orderIdx < executionOrder.length; orderIdx += 1) {
      const nodeId = executionOrder[orderIdx];
      if (executedNodeIds.has(nodeId)) {
        continue;
      }
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      if (node.type === 'input' || node.type === 'output') continue;

      const definition = getBlockDefinition(node.blockId);
      if (!definition) {
        throw new Error(`Unknown block: ${node.blockId}`);
      }

      if (definition.handler === 'nillion' && this.isBatchableNillionBlock(definition.id)) {
        const batchNodeIds = this.buildNillionBatch(graph, executionOrder, nodeIndex, orderIdx, executedNodeIds);
        const batchResult = await this.executeNillionBatch(graph, batchNodeIds, payload, context, runId);

        for (const step of batchResult.steps) {
          executionSteps.push(step);
          executedNodeIds.add(step.nodeId);
        }

        continue;
      }

      const nodeInputs = this.gatherNodeInputs(node, graph, context);
      const stepStart = Date.now();

      try {
        const connector = node.connector ? connectorMap.get(node.connector) : undefined;

        const nodeDataWithInputs: Record<string, any> = {
          ...(node.data as Record<string, any>),
          __inputs: nodeInputs,
        };

        const result = await this.executeNode(
          definition.id,
          definition.handler,
          nodeDataWithInputs,
          { payload, memory: Object.fromEntries(context.values) },
          connector,
        );

        const configAliases: string[] = [];
        const nodeData = node.data as Record<string, any>;
        const normalizedAlias = typeof nodeData?.alias === 'string' ? nodeData.alias.trim() : '';
        if (normalizedAlias) {
          configAliases.push(normalizedAlias);
        }
        const normalizedResponseAlias =
          typeof nodeData?.responseAlias === 'string' ? nodeData.responseAlias.trim() : '';
        if (normalizedResponseAlias) {
          configAliases.push(normalizedResponseAlias);
        }

        const storeOutputValue = (outputName: string, value: any) => {
          const keys = new Set<string>([`${nodeId}.${outputName}`]);
          if (node.alias) {
            keys.add(`${node.alias}.${outputName}`);
          }
          for (const aliasName of configAliases) {
            keys.add(`${aliasName}.${outputName}`);
          }
          for (const key of keys) {
            this.setContextValue(context, key, value);
          }
        };

        if (result && typeof result === 'object' && !Array.isArray(result)) {
          for (const [outputName, value] of Object.entries(result)) {
            storeOutputValue(outputName, value);
          }
          storeOutputValue('result', result);
        } else {
          storeOutputValue('result', result);
        }

        executionSteps.push({
          nodeId,
          blockId: node.blockId,
          inputs: nodeInputs,
          outputs: (result && typeof result === 'object') ? (result as Record<string, any>) : { result },
          duration: Date.now() - stepStart,
          status: 'success',
        });
        executedNodeIds.add(nodeId);
      } catch (error: any) {
        executionSteps.push({
          nodeId,
          blockId: node.blockId,
          inputs: nodeInputs,
          outputs: {},
          duration: Date.now() - stepStart,
          status: 'failed',
          error: error.message,
        });
        throw error;
      }
    }

    const outputNodes = graph.nodes.filter((n) => n.type === 'output');
    const outputs: Record<string, any> = {};

    for (const outputNode of outputNodes) {
      const incomingEdges = graph.edges.filter((e) => e.target === outputNode.id);
      for (const edge of incomingEdges) {
        const sourceOutput = edge.sourceHandle || 'result';
        const key = `${edge.source}.${sourceOutput}`;
        const value = context.values.get(key);
        if (value !== undefined) {
          const outputName = outputNode.data?.fieldName || outputNode.alias || outputNode.id;
          outputs[outputName] = value;
        }
      }
    }

    return {
      outputs,
      steps: executionSteps,
      duration: Date.now() - startTime,
      status: 'success',
    };
  }

  private isBatchableNillionBlock(blockId: string): boolean {
    return (
      blockId === 'math-add' ||
      blockId === 'math-subtract' ||
      blockId === 'math-multiply' ||
      blockId === 'math-divide' ||
      blockId === 'math-greater-than' ||
      blockId === 'logic-if-else'
    );
  }

  private buildNillionBatch(
    graph: WorkflowGraph,
    executionOrder: string[],
    nodeIndex: Map<string, number>,
    startIndex: number,
    executedNodeIds: Set<string>,
  ): string[] {
    const nodeById = new Map<string, WorkflowNode>();
    for (const node of graph.nodes) {
      nodeById.set(node.id, node);
    }

    const candidateIds = new Set<string>();
    for (let i = startIndex; i < executionOrder.length; i += 1) {
      const id = executionOrder[i];
      const node = nodeById.get(id);
      if (!node) continue;
      const def = getBlockDefinition(node.blockId);
      if (!def || def.handler !== 'nillion' || !this.isBatchableNillionBlock(def.id)) {
        continue;
      }
      if (executedNodeIds.has(id)) {
        continue;
      }
      candidateIds.add(id);
    }

    const batch = new Set<string>();
    let changed = true;

    while (changed) {
      changed = false;

      for (const id of candidateIds) {
        if (batch.has(id)) continue;
        const node = nodeById.get(id);
        if (!node) continue;

        const incoming = graph.edges.filter((e) => e.target === id);
        let ok = true;

        for (const edge of incoming) {
          const sourceId = edge.source;
          if (executedNodeIds.has(sourceId)) {
            continue;
          }

          const sourceIndex = nodeIndex.get(sourceId);
          if (sourceIndex === undefined) {
            continue;
          }

          if (sourceIndex < startIndex) {
            continue;
          }

          if (candidateIds.has(sourceId) && batch.has(sourceId)) {
            continue;
          }

          ok = false;
          break;
        }

        if (ok) {
          batch.add(id);
          changed = true;
        }
      }
    }

    const startNodeId = executionOrder[startIndex];
    if (!batch.has(startNodeId)) {
      return [startNodeId];
    }

    return Array.from(batch);
  }

  private ensureIntegerLiteral(raw: unknown, label: string, nodeId: string): string | number {
    if (raw === null || raw === undefined) {
      throw new Error(`Missing numeric input for ${label} at node ${nodeId}`);
    }

    if (typeof raw === 'number') {
      if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
        throw new Error(`Non-integer numeric input for ${label} at node ${nodeId}: ${raw}`);
      }
      return raw;
    }

    if (typeof raw === 'bigint') {
      return raw.toString();
    }

    if (typeof raw === 'boolean') {
      return raw ? 1 : 0;
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!/^[-+]?\d+$/.test(trimmed)) {
        throw new Error(`Invalid integer string for ${label} at node ${nodeId}: "${raw}"`);
      }
      return trimmed;
    }

    throw new Error(`Unsupported input type for ${label} at node ${nodeId}: ${typeof raw}`);
  }

  private async executeNillionBatch(
    graph: WorkflowGraph,
    batchNodeIds: string[],
    payload: Record<string, unknown>,
    context: ExecutionContext,
    runId: string,
  ): Promise<{ steps: ExecutionStep[] }> {
    const nodeById = new Map<string, WorkflowNode>();
    for (const node of graph.nodes) {
      nodeById.set(node.id, node);
    }

    const batchSet = new Set(batchNodeIds);
    const steps: ExecutionStep[] = [];

    const nillionGraphNodes: { id: string; blockId: string; inputs: Record<string, any> }[] = [];
    const nillionGraphEdges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[] = [];

    const nodeInputsById = new Map<string, Record<string, any>>();

    for (const nodeId of batchNodeIds) {
      const node = nodeById.get(nodeId);
      if (!node) continue;

      const definition = getBlockDefinition(node.blockId);
      if (!definition) {
        throw new Error(`Unknown block: ${node.blockId}`);
      }

      const nodeInputs = this.gatherNodeInputs(node, graph, context);
      nodeInputsById.set(nodeId, nodeInputs);

      let nillionBlockId: string;
      if (node.blockId === 'math-add') {
        nillionBlockId = 'nillion-add';
      } else if (node.blockId === 'math-subtract') {
        nillionBlockId = 'nillion-subtract';
      } else if (node.blockId === 'math-multiply') {
        nillionBlockId = 'nillion-multiply';
      } else if (node.blockId === 'math-divide') {
        nillionBlockId = 'nillion-divide';
      } else if (node.blockId === 'math-greater-than') {
        nillionBlockId = 'nillion-greater-than';
      } else if (node.blockId === 'logic-if-else') {
        nillionBlockId = 'nillion-if-else';
      } else {
        throw new Error(`Unsupported nillion block for batch: ${node.blockId}`);
      }

      const staticInputs: Record<string, any> = {};

      if (nillionBlockId === 'nillion-add' || nillionBlockId === 'nillion-subtract' || nillionBlockId === 'nillion-multiply' || nillionBlockId === 'nillion-divide' || nillionBlockId === 'nillion-greater-than') {
        const hasInternalA = graph.edges.some(
          (e) => e.target === nodeId && e.targetHandle === 'a' && batchSet.has(e.source),
        );
        const hasInternalB = graph.edges.some(
          (e) => e.target === nodeId && e.targetHandle === 'b' && batchSet.has(e.source),
        );

        if (!hasInternalA) {
          let aVal = nodeInputs.a;
          const aPath = (node.data as Record<string, any>).aPath as string | undefined;
          if (aVal === undefined && aPath) {
            aVal = this.getValueFromContext({ payload, memory: Object.fromEntries(context.values) }, aPath);
          }
          staticInputs.a = this.ensureIntegerLiteral(aVal, 'a', nodeId);
        }

        if (!hasInternalB) {
          let bVal = nodeInputs.b;
          const bPath = (node.data as Record<string, any>).bPath as string | undefined;
          if (bVal === undefined && bPath) {
            bVal = this.getValueFromContext({ payload, memory: Object.fromEntries(context.values) }, bPath);
          }
          staticInputs.b = this.ensureIntegerLiteral(bVal, 'b', nodeId);
        }
      } else if (nillionBlockId === 'nillion-if-else') {
        const hasInternalCondition = graph.edges.some(
          (e) => e.target === nodeId && e.targetHandle === 'condition' && batchSet.has(e.source),
        );
        const hasInternalTrue = graph.edges.some(
          (e) => e.target === nodeId && e.targetHandle === 'true' && batchSet.has(e.source),
        );
        const hasInternalFalse = graph.edges.some(
          (e) => e.target === nodeId && e.targetHandle === 'false' && batchSet.has(e.source),
        );

        if (!hasInternalCondition) {
          let condVal = nodeInputs.condition;
          const conditionPath = (node.data as Record<string, any>).conditionPath as string | undefined;
          if (condVal === undefined && conditionPath) {
            condVal = this.getValueFromContext({ payload, memory: Object.fromEntries(context.values) }, conditionPath);
          }
          staticInputs.condition = this.ensureIntegerLiteral(condVal, 'condition', nodeId);
        }

        if (!hasInternalTrue) {
          let trueVal = nodeInputs.true;
          const truePath = (node.data as Record<string, any>).truePath as string | undefined;
          if (trueVal === undefined && truePath) {
            trueVal = this.getValueFromContext({ payload, memory: Object.fromEntries(context.values) }, truePath);
          }
          staticInputs.true_value = this.ensureIntegerLiteral(trueVal, 'true_value', nodeId);
        }

        if (!hasInternalFalse) {
          let falseVal = nodeInputs.false;
          const falsePath = (node.data as Record<string, any>).falsePath as string | undefined;
          if (falseVal === undefined && falsePath) {
            falseVal = this.getValueFromContext({ payload, memory: Object.fromEntries(context.values) }, falsePath);
          }
          staticInputs.false_value = this.ensureIntegerLiteral(falseVal, 'false_value', nodeId);
        }
      }

      nillionGraphNodes.push({
        id: nodeId,
        blockId: nillionBlockId,
        inputs: staticInputs,
      });
    }

    for (const edge of graph.edges) {
      if (batchSet.has(edge.source) && batchSet.has(edge.target)) {
        nillionGraphEdges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        });
      }
    }

    const nillionGraph = {
      nodes: nillionGraphNodes,
      edges: nillionGraphEdges,
    } as any;

    const batchRunId = `${runId}-nillion-${Date.now()}`;
    const stepStart = Date.now();

    logger.debug(
      {
        runId: batchRunId,
        batchNodeIds,
        nillionGraph: {
          nodes: nillionGraphNodes.map((n) => ({ id: n.id, blockId: n.blockId, inputKeys: Object.keys(n.inputs) })),
          edges: nillionGraphEdges,
        },
      },
      'Executing Nillion batch graph',
    );

    try {
      const { output } = await nilccExecutionService.executeBlockGraph(nillionGraph, {}, batchRunId);

      for (const nodeId of batchNodeIds) {
        const node = nodeById.get(nodeId);
        if (!node) continue;

        const nodeInputs = nodeInputsById.get(nodeId) ?? {};
        const nodeData = node.data as Record<string, any>;
        const configAliases: string[] = [];
        const normalizedAlias = typeof nodeData?.alias === 'string' ? nodeData.alias.trim() : '';
        if (normalizedAlias) {
          configAliases.push(normalizedAlias);
        }
        const normalizedResponseAlias =
          typeof nodeData?.responseAlias === 'string' ? nodeData.responseAlias.trim() : '';
        if (normalizedResponseAlias) {
          configAliases.push(normalizedResponseAlias);
        }

        const storeOutputValue = (outputName: string, value: any) => {
          const keys = new Set<string>([`${nodeId}.${outputName}`]);
          if (node.alias) {
            keys.add(`${node.alias}.${outputName}`);
          }
          for (const aliasName of configAliases) {
            keys.add(`${aliasName}.${outputName}`);
          }
          for (const key of keys) {
            this.setContextValue(context, key, value);
          }
        };

        const valueKey = `${nodeId}.result`;
        const rawValue = (output as Record<string, unknown>)[valueKey];

        let normalizedValue: unknown = rawValue;
        if (node.blockId === 'math-greater-than') {
          if (typeof rawValue === 'boolean') {
            normalizedValue = rawValue;
          } else if (typeof rawValue === 'number') {
            normalizedValue = rawValue !== 0;
          } else if (typeof rawValue === 'string') {
            const lowered = rawValue.toLowerCase();
            normalizedValue = rawValue === '1' || lowered === 'true';
          } else {
            normalizedValue = Boolean(rawValue);
          }
        } else if (typeof rawValue === 'string') {
          const parsed = Number(rawValue);
          normalizedValue = Number.isNaN(parsed) ? rawValue : parsed;
        }

        storeOutputValue('result', normalizedValue);

        steps.push({
          nodeId,
          blockId: node.blockId,
          inputs: nodeInputs,
          outputs: { result: normalizedValue },
          duration: Date.now() - stepStart,
          status: 'success',
        });
      }
    } catch (error: any) {
      for (const nodeId of batchNodeIds) {
        const node = nodeById.get(nodeId);
        if (!node) continue;
        const nodeInputs = nodeInputsById.get(nodeId) ?? {};
        steps.push({
          nodeId,
          blockId: node.blockId,
          inputs: nodeInputs,
          outputs: {},
          duration: Date.now() - stepStart,
          status: 'failed',
          error: error.message,
        });
      }
      throw error;
    }

    return { steps };
  }

  // removed VM-based queued execution path

  private async executeNode(
    blockId: string,
    handler: string,
    nodeData: Record<string, any>,
    context: { payload: Record<string, unknown>; memory: MemoryMap },
    connector?: LeanConnector,
  ): Promise<unknown> {
    switch (handler) {
      case 'logic':
        return this.executeLogicBlock(blockId, nodeData, context);
      case 'nillion':
        return this.executeNillionBlock(blockId, nodeData, context);
      case 'nilai':
        return this.executeNilAIBlock(nodeData, context);
      case 'zcash':
        return this.executeZcashBlock(nodeData, context);
      case 'connector':
        return this.executeConnectorBlock(blockId, nodeData, context, connector);
      default:
        throw new Error(`Unsupported handler ${handler}`);
    }
  }

  private async executeLogicBlock(
    blockId: string,
    data: Record<string, any>,
    context: { payload: Record<string, unknown>; memory: MemoryMap },
  ): Promise<unknown> {
    if (blockId === 'payload-input') {
      const path = data.path as string | undefined;
      return path ? this.getValueFromContext(context, path) : context.payload;
    }

    if (blockId === 'json-extract') {
      const source = (data.source as string) === 'memory' ? context.memory : context.payload;
      return this.getValueFromObject(source, data.path as string);
    }

    if (blockId === 'memo-parser') {
      const source = this.getValueFromContext(context, data.sourcePath as string);
      if (typeof source !== 'string') return {};
      const delimiter = (data.delimiter as string) ?? ':';
      return source.split('\n').reduce<Record<string, string>>((acc, line) => {
        const [key, ...rest] = line.split(delimiter);
        if (key && rest.length) acc[key.trim()] = rest.join(delimiter).trim();
        return acc;
      }, {});
    }

    throw new Error(`Unknown logic block ${blockId}`);
  }

  private async executeNillionBlock(
    blockId: string,
    data: Record<string, any>,
    context: { payload: Record<string, unknown>; memory: MemoryMap },
  ): Promise<unknown> {
    const resolveSlotValue = (slotName: string): unknown => {
      const slots = (data.__inputSlots as Record<string, { source: string; output?: string }> | undefined) ?? {};
      const slot = slots[slotName];
      if (!slot || !slot.source) return undefined;
      const outputName = slot.output && typeof slot.output === 'string' && slot.output.length ? slot.output : 'result';
      return this.getValueFromContext(context, `memory.${slot.source}.${outputName}`);
    };

    if (
      blockId === 'math-add' ||
      blockId === 'math-subtract' ||
      blockId === 'math-multiply' ||
      blockId === 'math-divide' ||
      blockId === 'math-greater-than'
    ) {
      const edgeInputs = (data.__inputs as Record<string, unknown> | undefined) ?? {};

      let aVal = resolveSlotValue('a');
      let bVal = resolveSlotValue('b');

      if (aVal === undefined && 'a' in edgeInputs) {
        aVal = edgeInputs.a;
      }
      if (bVal === undefined && 'b' in edgeInputs) {
        bVal = edgeInputs.b;
      }

      if (aVal === undefined || bVal === undefined) {
        const aPath = data.aPath as string | undefined;
        const bPath = data.bPath as string | undefined;

        if (aVal === undefined && aPath) {
          aVal = this.getValueFromContext(context, aPath);
        }
        if (bVal === undefined && bPath) {
          bVal = this.getValueFromContext(context, bPath);
        }
      }

      const nillionBlockId =
        blockId === 'math-add'
          ? 'nillion-add'
          : blockId === 'math-subtract'
            ? 'nillion-subtract'
            : blockId === 'math-multiply'
              ? 'nillion-multiply'
              : blockId === 'math-divide'
                ? 'nillion-divide'
                : 'nillion-greater-than';

      const nillionGraph = {
        nodes: [
          {
            id: 'n1',
            blockId: nillionBlockId,
            inputs: {
              a: aVal,
              b: bVal,
            },
          },
        ],
        edges: [],
      };

      const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const { output } = await nilccExecutionService.executeBlockGraph(nillionGraph as any, {}, runId);
      const raw = (output as Record<string, unknown>)['n1.result'];

      if (blockId === 'math-greater-than') {
        if (typeof raw === 'boolean') return raw;
        if (typeof raw === 'number') return raw !== 0;
        if (typeof raw === 'string') return raw === '1' || raw.toLowerCase() === 'true';
        return Boolean(raw);
      }

      if (typeof raw === 'number') return raw;
      if (typeof raw === 'bigint') return Number(raw);
      if (typeof raw === 'string') {
        const parsed = Number(raw);
        return Number.isNaN(parsed) ? raw : parsed;
      }
      return raw;
    }

    if (blockId === 'logic-if-else') {
      const edgeInputs = (data.__inputs as Record<string, unknown> | undefined) ?? {};

      let condVal = resolveSlotValue('condition');
      let trueVal = resolveSlotValue('true');
      let falseVal = resolveSlotValue('false');

      if (condVal === undefined && 'condition' in edgeInputs) {
        condVal = edgeInputs.condition;
      }
      if (trueVal === undefined && 'true' in edgeInputs) {
        trueVal = edgeInputs.true;
      }
      if (falseVal === undefined && 'false' in edgeInputs) {
        falseVal = edgeInputs.false;
      }

      if (condVal === undefined || trueVal === undefined || falseVal === undefined) {
        const conditionPath = data.conditionPath as string | undefined;
        const truePath = data.truePath as string | undefined;
        const falsePath = data.falsePath as string | undefined;

        if (condVal === undefined && conditionPath) {
          condVal = this.getValueFromContext(context, conditionPath);
        }
        if (trueVal === undefined && truePath) {
          trueVal = this.getValueFromContext(context, truePath);
        }
        if (falseVal === undefined && falsePath) {
          falseVal = this.getValueFromContext(context, falsePath);
        }
      }

      const nillionGraph = {
        nodes: [
          {
            id: 'n1',
            blockId: 'nillion-if-else',
            inputs: {
              condition: condVal,
              true_value: trueVal,
              false_value: falseVal,
            },
          },
        ],
        edges: [],
      };

      const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const { output } = await nilccExecutionService.executeBlockGraph(nillionGraph as any, {}, runId);
      const raw = (output as Record<string, unknown>)['n1.result'];
      return raw;
    }

    if (blockId === 'nillion-compute') {
      const inputPath = data.inputPath as string | undefined;
      const input = inputPath ? this.getValueFromContext(context, inputPath) : data.inputs || context.payload;
      return nilccExecutionService.execute(
        data.workloadId as string,
        (input ?? {}) as Record<string, unknown>,
        (data.relativePath as string) || '/',
      );
    }

    if (blockId === 'nillion-block-graph') {
      const nillionGraph = data.nillionGraph as { nodes: any[]; edges: any[] };
      if (!nillionGraph || !nillionGraph.nodes || !nillionGraph.edges) {
        throw new Error('Nillion block graph missing graph definition');
      }

      const inputMapping = (data.inputMapping as Record<string, string>) || {};
      const graphInputs: Record<string, any> = {};

      for (const [graphInputKey, contextPath] of Object.entries(inputMapping)) {
        const value = this.getValueFromContext(context, contextPath);
        if (value !== undefined) {
          graphInputs[graphInputKey] = value;
        }
      }

      const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      return nilccExecutionService.executeBlockGraph(nillionGraph, graphInputs, runId);
    }

    if (blockId === 'state-store') {
      const dataToStore = data.dataPath ? this.getValueFromContext(context, data.dataPath as string) : context.payload;
      const key = data.keyPath ? this.getValueFromContext(context, data.keyPath as string) : 'default';
      const keyStr = typeof key === 'string' && key.length ? key : 'default';
      const encryptFields = data.encryptFields as string[] | undefined;
      const encryptAll = data.encryptAll as boolean | undefined;
      const hasEncryptFields = Array.isArray(encryptFields) && encryptFields.length > 0;
      const effectiveEncryptAll = encryptAll === true || (encryptAll === undefined && !hasEncryptFields);
      await nildbService.putDocument(
        data.collectionId as string,
        keyStr,
        (dataToStore ?? {}) as Record<string, unknown>,
        undefined,
        { encryptFields, encryptAll },
      );
      return { stored: true, encrypted: hasEncryptFields || effectiveEncryptAll };
    }

    if (blockId === 'state-read') {
      const keyValue = this.getValueFromContext(context, data.keyPath as string);
      const keyStr = typeof keyValue === 'string' && keyValue.length ? keyValue : 'default';
      return nildbService.getDocument(data.collectionId as string, keyStr);
    }

    throw new Error(`Unknown nillion block ${blockId}`);
  }

  private async executeNilAIBlock(
    data: Record<string, any>,
    context: { payload: Record<string, unknown>; memory: MemoryMap },
  ): Promise<NilAIBlockResult> {
    const template = data.promptTemplate as string;
    const rendered = template.replace(/{{(.*?)}}/g, (_match, path: string) => {
      const value = this.getValueFromContext(context, path.trim());
      return value !== undefined ? String(value) : '';
    });
    return nilaiService.runInference(rendered);
  }

  private async executeZcashBlock(
    data: Record<string, any>,
    context: { payload: Record<string, unknown>; memory: MemoryMap },
  ): Promise<{ txId: string; operationId: string }> {
    const amount = this.getValueFromContext(context, data.amountPath as string);
    const addressPath = data.addressPath as string | undefined;
    const memoPath = data.memoPath as string | undefined;
    const fromAddressPath = data.fromAddressPath as string | undefined;
    const address = addressPath
      ? (this.getValueFromContext(context, addressPath) as string)
      : (data.fallbackAddress as string);
    const fromAddress = fromAddressPath
      ? (this.getValueFromContext(context, fromAddressPath) as string)
      : (data.fallbackFromAddress as string | undefined);
    const memo = memoPath ? (this.getValueFromContext(context, memoPath) as string) : undefined;
    if (!address || amount === undefined) {
      throw new Error('Zcash block missing address or amount');
    }
    const privacyPolicy = (data.privacyPolicy as ZcashPrivacyPolicy | undefined) ?? undefined;
    const minConfirmations = data.minConfirmations as number | undefined;
    const fee = data.fee as number | undefined;
    const timeoutMs = data.timeoutMs as number | undefined;

    return zcashService.sendShieldedTransaction(address, amount as number | string, {
      memo,
      fromAddress,
      minConfirmations,
      fee: fee ?? null,
      privacyPolicy,
      timeoutMs,
    });
  }

  private async executeConnectorBlock(
    blockId: string,
    data: Record<string, any>,
    context: { payload: Record<string, unknown>; memory: MemoryMap },
    connector?: LeanConnector,
  ): Promise<unknown> {
    if (blockId === 'connector-request') {
      if (!connector) {
        throw new Error('Connector request requires connector');
      }
      const baseUrl = (connector.config as Record<string, unknown>).baseUrl as string;
      if (!baseUrl) {
        throw new Error('Connector missing baseUrl');
      }
      const url = new URL((data.relativePath as string) ?? '/', baseUrl).toString();
      return this.performHttpCall(url, data, context, connector.config as Record<string, unknown>);
    }

    if (blockId === 'custom-http-action') {
      const url = data.url as string;
      if (!url) {
        throw new Error('Custom HTTP block requires URL');
      }
      return this.performHttpCall(url, data, context);
    }

    return undefined;
  }

  private async performHttpCall(
    url: string,
    data: Record<string, any>,
    context: { payload: Record<string, unknown>; memory: MemoryMap },
    connectorConfig?: Record<string, unknown>,
  ): Promise<unknown> {
    const method = (data.method as string) ?? 'POST';
    const headers = {
      ...(connectorConfig?.headers as Record<string, string> | undefined),
      ...((data.headers as Record<string, string>) ?? {}),
    };
    const bodyPath = data.bodyPath as string | undefined;
    const bodyData = bodyPath ? this.getValueFromContext(context, bodyPath) : context.payload;
    const response = await axios.request({ method, url, headers, data: bodyData });
    return response.data;
  }

  private gatherNodeInputs(
    node: WorkflowNode,
    graph: WorkflowGraph,
    context: ExecutionContext,
  ): Record<string, any> {
    const inputs: Record<string, any> = { ...(node.data as Record<string, any>) };

    const incomingEdges = graph.edges.filter((e) => e.target === node.id);

    for (const edge of incomingEdges) {
      const sourceNode = graph.nodes.find((n) => n.id === edge.source);
      const defaultOutput = sourceNode?.type === 'input' ? 'value' : 'result';
      const sourceOutput = edge.sourceHandle || defaultOutput;

      let targetInput = edge.targetHandle;
      if (!targetInput && sourceNode?.type === 'input' && sourceNode.data?.fieldName) {
        targetInput = sourceNode.data.fieldName;
      }
      if (!targetInput) {
        targetInput = 'value';
      }

      const key = `${edge.source}.${sourceOutput}`;
      const value = context.values.get(key);

      if (value !== undefined) {
        inputs[targetInput] = value;
      }
    }

    return inputs;
  }

  private topologicalSort(graph: WorkflowGraph): string[] {
    const nodeMap = new Map<string, WorkflowNode>();
    const inDegree = new Map<string, number>();

    for (const node of graph.nodes) {
      nodeMap.set(node.id, node);
      inDegree.set(node.id, 0);
    }

    for (const edge of graph.edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    const queue: string[] = [];
    const result: string[] = [];

    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      const outgoingEdges = graph.edges.filter((e) => e.source === nodeId);
      for (const edge of outgoingEdges) {
        const newDegree = (inDegree.get(edge.target) || 0) - 1;
        inDegree.set(edge.target, newDegree);

        if (newDegree === 0) {
          queue.push(edge.target);
        }
      }
    }

    if (result.length !== graph.nodes.length) {
      throw new Error('Workflow graph contains cycles');
    }

    return result;
  }

  private validateGraph(graph: WorkflowGraph): void {
    if (!graph.nodes || graph.nodes.length === 0) {
      throw new Error('Graph must have at least one node');
    }

    if (!graph.edges) {
      throw new Error('Graph must have edges array');
    }

    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.source)) {
        throw new Error(`Edge references unknown source node: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        throw new Error(`Edge references unknown target node: ${edge.target}`);
      }
    }
  }

  private setContextValue(context: ExecutionContext, key: string, value: any): void {
    context.values.set(key, value);
    const segments = key.split('.');
    if (segments.length <= 1) {
      return;
    }

    const rootKey = segments[0];
    const nestedPath = segments.slice(1);
    const existingRoot = context.values.get(rootKey);
    const rootObject =
      existingRoot && typeof existingRoot === 'object' && !Array.isArray(existingRoot)
        ? { ...(existingRoot as Record<string, unknown>) }
        : {};
    this.assignNestedValue(rootObject, nestedPath, value);
    context.values.set(rootKey, rootObject);
  }

  private assignNestedValue(target: Record<string, any>, path: string[], value: any): void {
    let current = target;
    for (let i = 0; i < path.length - 1; i += 1) {
      const segment = path[i];
      const existing = current[segment];
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        current[segment] = { ...existing };
      } else {
        current[segment] = {};
      }
      current = current[segment];
    }
    current[path[path.length - 1]] = value;
  }

  private getValueFromContext(context: { payload: Record<string, unknown>; memory: MemoryMap }, path?: string) {
    if (!path) return undefined;
    const root = { payload: context.payload, memory: context.memory };
    return this.getValueFromObject(root, path);
  }

  private getValueFromObject(obj: any, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc === undefined || acc === null) return undefined;
      if (typeof acc === 'object' && key in acc) return (acc as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  private getNestedValue(obj: any, path: string): any {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
  }

  private async loadConnectors(graph: WorkflowGraph) {
    const connectorIds = graph.nodes
      .filter((node) => node.connector)
      .map((node) => node.connector)
      .filter((id): id is string => Boolean(id));

    if (!connectorIds.length) {
      return new Map<string, LeanConnector>();
    }

    const connectors = (await ConnectorModel.find({ _id: { $in: connectorIds } }).lean()) as unknown as LeanConnector[];
    return new Map(
      connectors.map((connector) => [
        connector._id.toString(),
        {
          ...connector,
          config: decryptConnectorConfig(connector.type, connector.config),
        },
      ]),
    );
  }
}

export const workflowEngine = new WorkflowEngine();
