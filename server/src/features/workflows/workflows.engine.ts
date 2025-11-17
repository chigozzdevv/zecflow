import axios from 'axios';
import { Types } from 'mongoose';
import { WorkflowModel } from './workflows.model';
import { RunModel } from '@/features/runs/runs.model';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { decryptConnectorConfig } from '@/features/connectors/connectors.security';
import { getBlockDefinition } from '@/features/blocks/blocks.registry';
import { nilccExecutionService } from '@/features/nillion-compute/nilcc-execution.service';
import { nilaiService } from '@/features/nillion-compute/nilai.service';
import { nildbService } from '@/features/nillion-compute/nildb.service';
import { zcashService, ZcashPrivacyPolicy } from '@/shared/services/zcash.service';
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

    try {
      const workflow = await WorkflowModel.findById(run.workflow);
      if (!workflow) {
        throw new Error('Workflow missing');
      }

      if (!workflow.graph || !workflow.graph.nodes || workflow.graph.nodes.length === 0) {
        throw new Error('Workflow graph is empty or missing');
      }

      const result = await this.executeGraph(workflow.graph, run.payload, runId);

      run.status = 'succeeded';
      run.result = { outputs: result.outputs, steps: result.steps };
      await run.save();
    } catch (error) {
      logger.error({ err: error, runId }, 'Workflow execution failed');
      run.status = 'failed';
      run.result = { error: (error as Error).message };
      await run.save();
    }
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

    for (const nodeId of executionOrder) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      if (node.type === 'input' || node.type === 'output') continue;

      const definition = getBlockDefinition(node.blockId);
      if (!definition) {
        throw new Error(`Unknown block: ${node.blockId}`);
      }

      const nodeInputs = this.gatherNodeInputs(node, graph, context);
      const stepStart = Date.now();

      try {
        const connector = node.connector ? connectorMap.get(node.connector) : undefined;

        const result = await this.executeNode(
          definition.id,
          definition.handler,
          node.data as Record<string, any>,
          { payload, memory: Object.fromEntries(context.values) },
          connector,
        );

        const configAlias =
          typeof (node.data as Record<string, any>)?.alias === 'string' && (node.data as Record<string, any>).alias.length
            ? (node.data as Record<string, any>).alias
            : undefined;

        const storeOutputValue = (outputName: string, value: any) => {
          const keys = new Set<string>([`${nodeId}.${outputName}`]);
          if (node.alias) {
            keys.add(`${node.alias}.${outputName}`);
          }
          if (configAlias) {
            keys.add(`${configAlias}.${outputName}`);
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
      await nildbService.putDocument(data.collectionId as string, keyStr, (dataToStore ?? {}) as Record<string, unknown>);
      return { stored: true };
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
