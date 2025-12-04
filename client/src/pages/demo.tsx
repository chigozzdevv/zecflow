import { useState, useEffect, useRef } from "react";
import { request } from "@/lib/api-client";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useNillionUser } from "@/context/nillion-user-context";
import { WorkflowGraphPreview } from "@/components/demo/workflow-graph-preview";
import type {
  WorkflowGraphDefinition,
  WorkflowGraphNode,
  WorkflowGraphEdge,
} from "@/components/demo/workflow-graph-preview";

type DemoWorkflowNode = {
  id: string;
  alias?: string;
  blockId: string;
  type: string;
  position?: { x: number; y: number } | null;
};
type LoanWorkflowResponse = {
  id: string;
  name: string;
  nodes: DemoWorkflowNode[];
  graph?: WorkflowGraphDefinition | null;
  collectionId?: string | null;
  datasetId?: string | null;
  builderDid?: string | null;
};
type MedicalWorkflowResponse = {
  id: string;
  name: string;
  nodes: DemoWorkflowNode[];
  graph?: WorkflowGraphDefinition | null;
};

type LoanSubmissionResponse = {
  stateKey: string;
  status: string;
  runId?: string;
  workflowId?: string;
};

type RunStatusResponse = {
  runId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  completedNodeIds: string[];
  outputs: Record<string, unknown>;
};

type MedicalDecision = {
  status: string;
  resultShielded: boolean;
  diagnosis?: string;
  stateKey?: string;
  resultKey?: string;
  runId?: string;
  workflowId?: string;
};

export function DemoPage() {
  const { did, connect, initializing } = useNillionUser();
  const [loanForm, setLoanForm] = useState({
    fullName: "",
    income: "",
    existingDebt: "",
    age: "",
    country: "",
    requestedAmount: "",
  });
  const [loanResult, setLoanResult] = useState<LoanSubmissionResponse | null>(null);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanLoading, setLoanLoading] = useState(false);
  const [loanRunId, setLoanRunId] = useState<string | null>(null);
  const [loanCompletedNodeIds, setLoanCompletedNodeIds] = useState<string[]>([]);
  const [loanRunStatus, setLoanRunStatus] = useState<string | null>(null);
  const loanPollingRef = useRef<NodeJS.Timeout | null>(null);

  const [medicalForm, setMedicalForm] = useState({
    symptoms: "",
    age: "",
    shieldResult: true,
  });
  const [medicalResult, setMedicalResult] = useState<MedicalDecision | null>(null);
  const [medicalError, setMedicalError] = useState<string | null>(null);
  const [medicalLoading, setMedicalLoading] = useState(false);
  const [medicalRunId, setMedicalRunId] = useState<string | null>(null);
  const [medicalCompletedNodeIds, setMedicalCompletedNodeIds] = useState<string[]>([]);
  const [medicalRunStatus, setMedicalRunStatus] = useState<string | null>(null);
  const medicalPollingRef = useRef<NodeJS.Timeout | null>(null);

  const [loanNodes, setLoanNodes] = useState<DemoWorkflowNode[]>([]);
  const [medicalNodes, setMedicalNodes] = useState<DemoWorkflowNode[]>([]);
  const [loanGraph, setLoanGraph] = useState<WorkflowGraphDefinition | null>(null);
  const [medicalGraph, setMedicalGraph] = useState<WorkflowGraphDefinition | null>(null);
  const [loanCollectionId, setLoanCollectionId] = useState<string | null>(null);

  const fetchLoanWorkflow = async () => {
    try {
      const loan = await request<LoanWorkflowResponse>("/demo/loan-workflow");
      setLoanNodes(loan.nodes ?? []);
      setLoanGraph(loan.graph ?? buildGraphFromNodes(loan.nodes ?? []));
      setLoanCollectionId(loan.collectionId ?? null);
    } catch {
      setLoanNodes([]);
      setLoanGraph(null);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchLoanWorkflow();
      try {
        const med = await request<MedicalWorkflowResponse>("/demo/medical-workflow");
        setMedicalNodes(med.nodes ?? []);
        setMedicalGraph(med.graph ?? buildGraphFromNodes(med.nodes ?? []));
      } catch {
        setMedicalNodes([]);
        setMedicalGraph(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loanRunId) return;

    const pollStatus = async () => {
      try {
        const res = await request<RunStatusResponse>(`/demo/run-status/${loanRunId}`);
        setLoanCompletedNodeIds(res.completedNodeIds);
        setLoanRunStatus(res.status);

        if (res.status === "succeeded" || res.status === "failed") {
          if (loanPollingRef.current) {
            clearInterval(loanPollingRef.current);
            loanPollingRef.current = null;
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    pollStatus();
    loanPollingRef.current = setInterval(pollStatus, 1500);

    return () => {
      if (loanPollingRef.current) {
        clearInterval(loanPollingRef.current);
        loanPollingRef.current = null;
      }
    };
  }, [loanRunId]);

  useEffect(() => {
    if (!medicalRunId) return;

    const pollStatus = async () => {
      try {
        const res = await request<RunStatusResponse>(`/demo/run-status/${medicalRunId}`);
        setMedicalCompletedNodeIds(res.completedNodeIds);
        setMedicalRunStatus(res.status);
        if (res.status === "succeeded" || res.status === "failed") {
          if (medicalPollingRef.current) {
            clearInterval(medicalPollingRef.current);
            medicalPollingRef.current = null;
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    pollStatus();
    medicalPollingRef.current = setInterval(pollStatus, 1500);

    return () => {
      if (medicalPollingRef.current) {
        clearInterval(medicalPollingRef.current);
        medicalPollingRef.current = null;
      }
    };
  }, [medicalRunId]);

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoanError(null);
    setLoanResult(null);
    setLoanRunId(null);
    setLoanCompletedNodeIds([]);
    setLoanRunStatus(null);

    if (!loanCollectionId) {
      setLoanError("Loan collection is not configured. Contact the app operator.");
      return;
    }

    setLoanLoading(true);
    const income = Number(loanForm.income);
    const existingDebt = Number(loanForm.existingDebt);
    const age = Number(loanForm.age);
    const requestedAmount = Number(loanForm.requestedAmount);
    if (!loanForm.fullName || Number.isNaN(income) || Number.isNaN(existingDebt) || Number.isNaN(age) || Number.isNaN(requestedAmount)) {
      setLoanError("Please fill all fields with valid values.");
      setLoanLoading(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        fullName: loanForm.fullName.trim(),
        income,
        existingDebt,
        age,
        country: loanForm.country.trim(),
        requestedAmount,
        userDid: did ?? undefined,
      };

      const res = await request<LoanSubmissionResponse>("/demo/loan-app", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setLoanResult(res);
      if (res.runId) {
        setLoanRunId(res.runId);
      }
    } catch (err: any) {
      setLoanError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setLoanLoading(false);
    }
  };

  const handleMedicalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMedicalError(null);
    setMedicalResult(null);
    setMedicalLoading(true);
    setMedicalRunId(null);
    setMedicalCompletedNodeIds([]);
    setMedicalRunStatus(null);
    const age = Number(medicalForm.age);
    if (!medicalForm.symptoms || Number.isNaN(age)) {
      setMedicalError("Please describe symptoms and provide age.");
      setMedicalLoading(false);
      return;
    }
    try {
      const res = await request<MedicalDecision>("/demo/medicals", {
        method: "POST",
        body: JSON.stringify({
          symptoms: medicalForm.symptoms,
          age,
          shieldResult: medicalForm.shieldResult,
        }),
      });
      setMedicalResult(res);
      if (res.runId) {
        setMedicalRunId(res.runId);
      }
      setMedicalRunStatus(res.status);
    } catch (err: any) {
      setMedicalError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setMedicalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to landing
          </Link>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500">
            <span>Demo</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-[#b2a8ff]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b2a8ff]" /> Testnet
            </span>
          </div>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] gap-10">
          <div>
          <h1 className="text-3xl font-bold mb-2">Medical Diagnosis</h1>
          <p className="text-sm text-zinc-400 mb-6">
            Describe the symptoms and let our NilAI private reasoning block perform a blind diagnosis while ZecFlow only observes that the evaluation completed.
          </p>
          <form onSubmit={handleMedicalSubmit} className="space-y-4 max-w-xl">
            <textarea
              className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm w-full min-h-[80px]"
              placeholder="Describe the symptoms (e.g. fever, cough, chest pain)"
              value={medicalForm.symptoms}
              onChange={(e) => setMedicalForm((f) => ({ ...f, symptoms: e.target.value }))}
            />
            <div>
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm w-32"
                placeholder="Age"
                value={medicalForm.age}
                onChange={(e) => setMedicalForm((f) => ({ ...f, age: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-[#6758c1] hover:bg-[#5344ad] text-sm font-medium"
            >
              Run Medical Demo
            </button>
          </form>
          {medicalError && <p className="text-sm text-red-400 mt-3">{medicalError}</p>}
          {medicalResult && (
            <div className="mt-4 text-sm text-zinc-300 space-y-1">
              <div>
                Status: <span className={`font-semibold ${medicalRunStatus === "succeeded" ? "text-emerald-400" : medicalRunStatus === "failed" ? "text-red-400" : "text-white"}`}>
                  {medicalRunStatus || medicalResult.status}
                </span>
              </div>
              <div>
                Result shielded: <span className="font-semibold text-white">{medicalResult.resultShielded ? "yes" : "no"}</span>
              </div>
              {medicalRunId && (
                <div className="text-xs text-zinc-500 break-all">Run ID: {medicalRunId}</div>
              )}
              {medicalResult.diagnosis && !medicalResult.resultShielded && (
                <div>Diagnosis: <span className="font-semibold text-white">{medicalResult.diagnosis}</span></div>
              )}
              {medicalResult.resultKey && (
                <div className="text-xs text-zinc-500 break-all">Result key (NilDB ref): {medicalResult.resultKey}</div>
              )}
              {medicalResult.stateKey && !medicalResult.resultKey && (
                <div className="text-xs text-zinc-500 break-all">State key (NilDB ref): {medicalResult.stateKey}</div>
              )}
            </div>
          )}
          </div>

          <aside>
            <WorkflowGraphPreview
              title="Medical workflow blocks"
              graph={medicalGraph ?? buildGraphFromNodes(medicalNodes)}
              completedNodeIds={medicalCompletedNodeIds}
              running={medicalLoading || medicalRunStatus === "running" || medicalRunStatus === "pending"}
              accent="purple"
              height={320}
              emptyMessage="No workflow graph found for demo medical workflow."
            />
          </aside>
        </section>

        <section className="border-t border-zinc-800 pt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] gap-10">
          <div>
          <h2 className="text-2xl font-bold mb-2">Loan Application</h2>
          <p className="text-sm text-zinc-400 mb-6">
            Submit a sample loan application processed by a NilCC workload over encrypted inputs, with a NilAI block explaining the outcome for automation signals.
          </p>
          <div className="mb-4 text-xs text-zinc-300 flex items-center gap-3">
            <button
              type="button"
              onClick={() => connect().catch((err) => console.error(err))}
              disabled={initializing}
              className="px-3 py-1.5 rounded border border-[#6758c1] bg-[#6758c1]/10 hover:bg-[#6758c1]/20 disabled:opacity-60"
            >
              {did ? "Wallet connected to Nillion" : initializing ? "Connecting…" : "Connect wallet to Nillion"}
            </button>
            {did && <span className="text-[11px] text-zinc-500 truncate">DID: {did}</span>}
          </div>
          <form onSubmit={handleLoanSubmit} className="space-y-4 max-w-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                placeholder="Full name"
                value={loanForm.fullName}
                onChange={(e) => setLoanForm((f) => ({ ...f, fullName: e.target.value }))}
              />
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                placeholder="Country"
                value={loanForm.country}
                onChange={(e) => setLoanForm((f) => ({ ...f, country: e.target.value }))}
              />
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                placeholder="Monthly income (e.g. 5000)"
                value={loanForm.income}
                onChange={(e) => setLoanForm((f) => ({ ...f, income: e.target.value }))}
              />
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                placeholder="Existing debt (e.g. 1000)"
                value={loanForm.existingDebt}
                onChange={(e) => setLoanForm((f) => ({ ...f, existingDebt: e.target.value }))}
              />
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                placeholder="Age"
                value={loanForm.age}
                onChange={(e) => setLoanForm((f) => ({ ...f, age: e.target.value }))}
              />
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
                placeholder="Requested amount"
                value={loanForm.requestedAmount}
                onChange={(e) => setLoanForm((f) => ({ ...f, requestedAmount: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-[#6758c1] hover:bg-[#5344ad] text-sm font-medium"
            >
              Run Loan Demo
            </button>
            <p className="text-[11px] text-zinc-500">
              *Demo will fail if no NilCC metal instance is active on the testnet environment.
            </p>
          </form>
          {loanError && <p className="text-sm text-red-400 mt-3">{loanError}</p>}
          {loanResult && (
            <div className="mt-4 text-sm text-zinc-300 space-y-1">
              <div>
                Status:{" "}
                <span className={`font-semibold ${loanRunStatus === "succeeded" ? "text-emerald-400" : loanRunStatus === "failed" ? "text-red-400" : "text-white"}`}>
                  {loanRunStatus || loanResult.status}
                </span>
              </div>
              {loanRunId && (
                <div className="text-xs text-zinc-500 break-all">Run ID: {loanRunId}</div>
              )}
              <div className="text-xs text-zinc-500 break-all">State key (NilDB ref): {loanResult.stateKey}</div>
            </div>
          )}
          </div>

          <aside>
            <WorkflowGraphPreview
              title="Loan workflow blocks"
              graph={loanGraph ?? buildGraphFromNodes(loanNodes)}
              completedNodeIds={loanCompletedNodeIds}
              running={loanLoading || loanRunStatus === "running" || loanRunStatus === "pending"}
              accent="purple"
              height={320}
              emptyMessage="No workflow graph found for demo loan workflow."
            />
          </aside>
        </section>

        <div className="border-t border-zinc-800 pt-8 text-center text-sm text-zinc-400">
          More demo apps are coming soon. To create custom workflows, click
          {" "}
          <Link to="/auth" className="text-white font-medium hover:text-[#b2a8ff]">
            Get Started
          </Link>
          .
        </div>
      </div>
    </div>
  );
}

const BUILDER_GRID_COLUMNS = 4;
const BUILDER_GRID_X_START = 120;
const BUILDER_GRID_Y_START = 80;
const BUILDER_GRID_X_STEP = 220;
const BUILDER_GRID_Y_STEP = 140;

function resolveNodePosition(pos: DemoWorkflowNode['position'], idx: number): { x: number; y: number } {
  if (pos && typeof pos.x === "number" && typeof pos.y === "number" && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    return pos;
  }
  const column = idx % BUILDER_GRID_COLUMNS;
  const row = Math.floor(idx / BUILDER_GRID_COLUMNS);
  return {
    x: BUILDER_GRID_X_START + column * BUILDER_GRID_X_STEP,
    y: BUILDER_GRID_Y_START + row * BUILDER_GRID_Y_STEP,
  };
}

function buildGraphFromNodes(nodes: DemoWorkflowNode[] | undefined): WorkflowGraphDefinition | null {
  if (!nodes || nodes.length === 0) return null;
  const graphNodes: WorkflowGraphNode[] = nodes.map((node, idx) => ({
    id: node.id,
    alias: node.alias,
    blockId: node.blockId,
    type: node.type,
    position: resolveNodePosition(node.position, idx),
  }));

  const edges: WorkflowGraphEdge[] = [];
  for (let i = 1; i < nodes.length; i += 1) {
    const prev = nodes[i - 1];
    const current = nodes[i];
    edges.push({
      id: `${prev.id}-${current.id}`,
      source: prev.id,
      target: current.id,
    });
  }

  return { nodes: graphNodes, edges };
}
