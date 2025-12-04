import { getNillionBlock } from '@/features/blocks/nillion-blocks.registry';
import { NillionComputeBlock } from '@/features/blocks/blocks.types';

export interface NillionBlockNode {
  id: string;
  blockId: string;
  inputs: Record<string, any>;
}

export interface NillionBlockEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface NillionBlockGraph {
  nodes: NillionBlockNode[];
  edges: NillionBlockEdge[];
}

class NillionCodeGeneratorService {
  generateNodeJsCode(graph: NillionBlockGraph, workflowInputs: Record<string, any>): string {
    const executionOrder = this.topologicalSort(graph);
    const codeLines: string[] = [];

    codeLines.push('const fs = require("fs");');
    codeLines.push('const path = require("path");');
    codeLines.push('');
    codeLines.push('process.on("uncaughtException", (err) => {');
    codeLines.push('  console.error("[WORKFLOW] Uncaught exception:", err);');
    codeLines.push('  process.exit(1);');
    codeLines.push('});');
    codeLines.push('process.on("unhandledRejection", (reason) => {');
    codeLines.push('  console.error("[WORKFLOW] Unhandled rejection:", reason);');
    codeLines.push('});');
    codeLines.push('');
    codeLines.push('console.log("[WORKFLOW] ========================================");');
    codeLines.push('console.log("[WORKFLOW] Starting workflow.js...");');
    codeLines.push('console.log("[WORKFLOW] Node version:", process.version);');
    codeLines.push('console.log("[WORKFLOW] Current directory:", process.cwd());');
    codeLines.push('console.log("[WORKFLOW] Checking /app directory...");');
    codeLines.push('if (fs.existsSync("/app")) {');
    codeLines.push('  console.log("[WORKFLOW] Files in /app:", fs.readdirSync("/app"));');
    codeLines.push('} else {');
    codeLines.push('  console.error("[WORKFLOW] ERROR: /app directory not found!");');
    codeLines.push('}');
    codeLines.push('console.log("[WORKFLOW] ========================================");');
    codeLines.push('');
    codeLines.push('function normalizeOutputValue(value) {');
    codeLines.push('  if (typeof value === "bigint") {');
    codeLines.push('    return value.toString();');
    codeLines.push('  }');
    codeLines.push('  return value;');
    codeLines.push('}');
    codeLines.push('');
    codeLines.push('async function executeWorkflow(inputs) {');
    codeLines.push('  const results = {};');
    codeLines.push('');

    for (const nodeId of executionOrder) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const block = getNillionBlock(node.blockId);
      if (!block) {
        throw new Error(`Unknown block: ${node.blockId}`);
      }

      const nodeCode = this.generateNodeCode(node, block, graph);
      codeLines.push(`  // Node: ${node.id} (${block.name})`);
      codeLines.push(nodeCode);
      codeLines.push('');
    }

    codeLines.push('  const output = {};');
    for (const node of graph.nodes) {
      const block = getNillionBlock(node.blockId);
      if (block && block.outputs.length > 0) {
        for (const output of block.outputs) {
          codeLines.push(`  if (results["${node.id}.${output.name}"] !== undefined) {`);
          codeLines.push(`    output["${node.id}.${output.name}"] = normalizeOutputValue(results["${node.id}.${output.name}"]);`);
          codeLines.push('  }');
        }
      }
    }
    codeLines.push('');
    codeLines.push('  return output;');
    codeLines.push('}');
    codeLines.push('');
    codeLines.push('const http = require("http");');
    codeLines.push('');
    codeLines.push('console.log("[WORKFLOW] Reading input.json...");');
    codeLines.push('let inputData;');
    codeLines.push('try {');
    codeLines.push('  const inputRaw = fs.readFileSync("/app/input.json", "utf8");');
    codeLines.push('  inputData = JSON.parse(inputRaw);');
    codeLines.push('  console.log("[WORKFLOW] Input loaded successfully:", Object.keys(inputData));');
    codeLines.push('} catch (err) {');
    codeLines.push('  console.error("[WORKFLOW] Failed to read input.json:", err.message);');
    codeLines.push('  inputData = {};');
    codeLines.push('}');
    codeLines.push('');
    codeLines.push('let outputData = null;');
    codeLines.push('let errorData = null;');
    codeLines.push('let isReady = false;');
    codeLines.push('');
    codeLines.push('const url = require("url");');
    codeLines.push('');
    codeLines.push('const server = http.createServer((req, res) => {');
    codeLines.push('  const parsedUrl = url.parse(req.url, true);');
    codeLines.push('  const pathname = parsedUrl.pathname;');
    codeLines.push('  console.log("[WORKFLOW] Request:", req.method, pathname, "isReady:", isReady);');
    codeLines.push('');
    codeLines.push('  res.setHeader("Access-Control-Allow-Origin", "*");');
    codeLines.push('  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");');
    codeLines.push('  res.setHeader("Content-Type", "application/json");');
    codeLines.push('  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");');
    codeLines.push('  res.setHeader("Pragma", "no-cache");');
    codeLines.push('  res.setHeader("Expires", "0");');
    codeLines.push('');
    codeLines.push('  if (req.method === "OPTIONS") {');
    codeLines.push('    res.writeHead(204);');
    codeLines.push('    res.end();');
    codeLines.push('    return;');
    codeLines.push('  }');
    codeLines.push('');
    codeLines.push('  if (pathname === "/output.json" || pathname === "/") {');
    codeLines.push('    if (!isReady) {');
    codeLines.push('      res.writeHead(202);');
    codeLines.push('      res.end(JSON.stringify({ status: "processing" }));');
    codeLines.push('      return;');
    codeLines.push('    }');
    codeLines.push('    if (errorData) {');
    codeLines.push('      res.writeHead(500);');
    codeLines.push('      res.end(JSON.stringify(errorData));');
    codeLines.push('      return;');
    codeLines.push('    }');
    codeLines.push('    res.writeHead(200);');
    codeLines.push('    res.end(JSON.stringify(outputData, null, 2));');
    codeLines.push('    return;');
    codeLines.push('  }');
    codeLines.push('');
    codeLines.push('  if (pathname === "/health") {');
    codeLines.push('    res.writeHead(200);');
    codeLines.push('    res.end(JSON.stringify({ status: isReady ? "ready" : "processing" }));');
    codeLines.push('    return;');
    codeLines.push('  }');
    codeLines.push('');
    codeLines.push('  res.writeHead(404);');
    codeLines.push('  res.end(JSON.stringify({ error: "Not found" }));');
    codeLines.push('});');
    codeLines.push('');
    codeLines.push('console.log("[WORKFLOW] About to start HTTP server on port 3000...");');
    codeLines.push('server.listen(3000, "0.0.0.0", () => {');
    codeLines.push('  console.log("[WORKFLOW] HTTP server started and listening on 0.0.0.0:3000");');
    codeLines.push('');
    codeLines.push('  console.log("[WORKFLOW] Starting workflow execution...");');
    codeLines.push('  executeWorkflow(inputData)');
    codeLines.push('    .then(output => {');
    codeLines.push('      outputData = output;');
    codeLines.push('      isReady = true;');
    codeLines.push('      console.log("[WORKFLOW] Execution completed successfully");');
    codeLines.push('      console.log("[WORKFLOW] Output keys:", Object.keys(output));');
    codeLines.push('      try {');
    codeLines.push('        fs.writeFileSync("/app/output.json", JSON.stringify(output, null, 2));');
    codeLines.push('        console.log("[WORKFLOW] Output written to /app/output.json");');
    codeLines.push('      } catch (writeErr) {');
    codeLines.push('        console.error("[WORKFLOW] Failed to write output.json:", writeErr.message);');
    codeLines.push('      }');
    codeLines.push('    })');
    codeLines.push('    .catch(error => {');
    codeLines.push('      console.error("[WORKFLOW] Execution failed:", error);');
    codeLines.push('      errorData = { error: error.message };');
    codeLines.push('      isReady = true;');
    codeLines.push('      try {');
    codeLines.push('        fs.writeFileSync("/app/error.json", JSON.stringify({ error: error.message }, null, 2));');
    codeLines.push('      } catch (writeErr) {');
    codeLines.push('        console.error("[WORKFLOW] Failed to write error.json:", writeErr.message);');
    codeLines.push('      }');
    codeLines.push('    });');
    codeLines.push('});');

    return codeLines.join('\n');
  }

  private generateNodeCode(node: NillionBlockNode, block: NillionComputeBlock, graph: NillionBlockGraph): string {
    const inputValues = this.resolveNodeInputs(node, graph);
    const code: string[] = [];

    code.push(`  try {`);

    const category = block.category;

    if (category === 'math') {
      code.push(...this.generateMathCode(node, block, inputValues));
    } else if (category === 'comparison') {
      code.push(...this.generateComparisonCode(node, block, inputValues));
    } else if (category === 'logical') {
      code.push(...this.generateLogicalCode(node, block, inputValues));
    } else if (category === 'control_flow') {
      code.push(...this.generateControlFlowCode(node, block, inputValues));
    } else if (category === 'statistical') {
      code.push(...this.generateStatisticalCode(node, block, inputValues));
    } else if (category === 'use_case') {
      code.push(...this.generateUseCaseCode(node, block, inputValues));
    } else {
      throw new Error(`Unsupported category: ${category}`);
    }

    code.push(`  } catch (err) {`);
    code.push(`    throw new Error("Node ${node.id} failed: " + err.message);`);
    code.push(`  }`);

    return code.join('\n');
  }

  private generateMathCode(node: NillionBlockNode, block: NillionComputeBlock, inputValues: Record<string, string>): string[] {
    const code: string[] = [];
    const blockId = block.id;

    if (blockId === 'nillion-add') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) + BigInt(${inputValues.b});`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-subtract') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) - BigInt(${inputValues.b});`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-multiply') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) * BigInt(${inputValues.b});`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-divide') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.b}) !== 0n ? BigInt(${inputValues.a}) / BigInt(${inputValues.b}) : 0n;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-modulo') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) % BigInt(${inputValues.b});`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-power') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.base}) ** BigInt(${inputValues.exponent});`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-abs-diff') {
      code.push(`    const a_val = BigInt(${inputValues.a});`);
      code.push(`    const b_val = BigInt(${inputValues.b});`);
      code.push(`    const result_${node.id} = a_val > b_val ? a_val - b_val : b_val - a_val;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    }

    return code;
  }

  private generateComparisonCode(node: NillionBlockNode, block: NillionComputeBlock, inputValues: Record<string, string>): string[] {
    const code: string[] = [];
    const blockId = block.id;

    if (blockId === 'nillion-greater-than') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) > BigInt(${inputValues.b}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-less-than') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) < BigInt(${inputValues.b}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-equal') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) === BigInt(${inputValues.b}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-greater-equal') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) >= BigInt(${inputValues.b}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-less-equal') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.a}) <= BigInt(${inputValues.b}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-in-range') {
      code.push(`    const val = BigInt(${inputValues.value});`);
      code.push(`    const min = BigInt(${inputValues.min});`);
      code.push(`    const max = BigInt(${inputValues.max});`);
      code.push(`    const result_${node.id} = (val >= min && val <= max) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    }

    return code;
  }

  private generateLogicalCode(node: NillionBlockNode, block: NillionComputeBlock, inputValues: Record<string, string>): string[] {
    const code: string[] = [];
    const blockId = block.id;

    if (blockId === 'nillion-and') {
      code.push(`    const result_${node.id} = (${inputValues.a} && ${inputValues.b}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-or') {
      code.push(`    const result_${node.id} = (${inputValues.a} || ${inputValues.b}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-not') {
      code.push(`    const result_${node.id} = !${inputValues.a} ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-xor') {
      code.push(`    const result_${node.id} = (!!${inputValues.a} !== !!${inputValues.b}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    }

    return code;
  }

  private generateControlFlowCode(node: NillionBlockNode, block: NillionComputeBlock, inputValues: Record<string, string>): string[] {
    const code: string[] = [];
    const blockId = block.id;

    if (blockId === 'nillion-if-else') {
      code.push(`    const result_${node.id} = ${inputValues.condition} ? ${inputValues.true_value} : ${inputValues.false_value};`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    }

    return code;
  }

  private generateStatisticalCode(node: NillionBlockNode, block: NillionComputeBlock, inputValues: Record<string, string>): string[] {
    const code: string[] = [];
    const blockId = block.id;

    if (blockId === 'nillion-average') {
      code.push(`    const values_${node.id} = ${inputValues.values};`);
      code.push(`    const count_${node.id} = ${inputValues.count};`);
      code.push(`    const sum_${node.id} = values_${node.id}.slice(0, count_${node.id}).reduce((a, b) => BigInt(a) + BigInt(b), 0n);`);
      code.push(`    const result_${node.id} = sum_${node.id} / BigInt(count_${node.id});`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-sum') {
      code.push(`    const values_${node.id} = ${inputValues.values};`);
      code.push(`    const count_${node.id} = ${inputValues.count};`);
      code.push(`    const result_${node.id} = values_${node.id}.slice(0, count_${node.id}).reduce((a, b) => BigInt(a) + BigInt(b), 0n);`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-min') {
      code.push(`    const values_${node.id} = ${inputValues.values};`);
      code.push(`    const count_${node.id} = ${inputValues.count};`);
      code.push(`    const result_${node.id} = values_${node.id}.slice(0, count_${node.id}).reduce((a, b) => BigInt(a) < BigInt(b) ? a : b);`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-max') {
      code.push(`    const values_${node.id} = ${inputValues.values};`);
      code.push(`    const count_${node.id} = ${inputValues.count};`);
      code.push(`    const result_${node.id} = values_${node.id}.slice(0, count_${node.id}).reduce((a, b) => BigInt(a) > BigInt(b) ? a : b);`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-median') {
      code.push(`    const values_${node.id} = ${inputValues.values};`);
      code.push(`    const count_${node.id} = ${inputValues.count};`);
      code.push(`    const sorted_${node.id} = values_${node.id}.slice(0, count_${node.id}).sort((a, b) => {`);
      code.push(`      const diff = BigInt(a) - BigInt(b);`);
      code.push(`      return diff < 0n ? -1 : diff > 0n ? 1 : 0;`);
      code.push(`    });`);
      code.push(`    const mid_${node.id} = Math.floor(count_${node.id} / 2);`);
      code.push(`    const result_${node.id} = count_${node.id} % 2 === 0 ? (BigInt(sorted_${node.id}[mid_${node.id} - 1]) + BigInt(sorted_${node.id}[mid_${node.id}])) / 2n : BigInt(sorted_${node.id}[mid_${node.id}]);`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    }

    return code;
  }

  private generateUseCaseCode(node: NillionBlockNode, block: NillionComputeBlock, inputValues: Record<string, string>): string[] {
    const code: string[] = [];
    const blockId = block.id;

    if (blockId === 'nillion-meets-threshold') {
      code.push(`    const result_${node.id} = BigInt(${inputValues.value}) >= BigInt(${inputValues.threshold}) ? 1 : 0;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    } else if (blockId === 'nillion-weighted-average') {
      code.push(`    const values_${node.id} = ${inputValues.values};`);
      code.push(`    const weights_${node.id} = ${inputValues.weights};`);
      code.push(`    let weightedSum_${node.id} = 0n;`);
      code.push(`    let totalWeight_${node.id} = 0n;`);
      code.push(`    for (let i = 0; i < 5; i++) {`);
      code.push(`      weightedSum_${node.id} += BigInt(values_${node.id}[i]) * BigInt(weights_${node.id}[i]);`);
      code.push(`      totalWeight_${node.id} += BigInt(weights_${node.id}[i]);`);
      code.push(`    }`);
      code.push(`    const result_${node.id} = totalWeight_${node.id} !== 0n ? weightedSum_${node.id} / totalWeight_${node.id} : 0n;`);
      code.push(`    results["${node.id}.result"] = result_${node.id};`);
    }

    return code;
  }

  private resolveNodeInputs(node: NillionBlockNode, graph: NillionBlockGraph): Record<string, string> {
    const incomingEdges = graph.edges.filter((e) => e.target === node.id);
    const inputValues: Record<string, string> = {};

    const block = getNillionBlock(node.blockId);
    if (!block) return inputValues;

    for (const input of block.inputs) {
      const edge = incomingEdges.find((e) => e.targetHandle === input.name || (!e.targetHandle && block.inputs.length === 1));

      if (edge) {
        const sourceOutput = edge.sourceHandle || 'result';
        inputValues[input.name] = `results["${edge.source}.${sourceOutput}"]`;
      } else if (node.inputs && node.inputs[input.name] !== undefined) {
        inputValues[input.name] = JSON.stringify(node.inputs[input.name]);
      } else if (input.default !== undefined) {
        inputValues[input.name] = JSON.stringify(input.default);
      } else {
        inputValues[input.name] = `inputs["${input.name}"]`;
      }
    }

    return inputValues;
  }

  private topologicalSort(graph: NillionBlockGraph): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const node of graph.nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    }

    for (const edge of graph.edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      const neighbors = adjList.get(edge.source) || [];
      neighbors.push(edge.target);
      adjList.set(edge.source, neighbors);
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const result: string[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (result.length !== graph.nodes.length) {
      throw new Error('Graph contains cycles');
    }

    return result;
  }
}

export const nillionCodeGeneratorService = new NillionCodeGeneratorService();
