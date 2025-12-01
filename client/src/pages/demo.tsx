import { useState, useEffect, useRef } from "react";
import { request } from "@/lib/api-client";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useNillionUser } from "@/context/nillion-user-context";

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
};

export function DemoPage() {
  const { client: nillionClient, did, connect, initializing, setDelegationToken } = useNillionUser();
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

  type DemoWorkflowNode = { id: string; alias?: string; blockId: string; type: string };
  type LoanWorkflowResponse = {
    id: string;
    name: string;
    nodes: DemoWorkflowNode[];
    collectionId?: string | null;
    datasetId?: string | null;
    builderDid?: string | null;
  };
  const [loanNodes, setLoanNodes] = useState<DemoWorkflowNode[]>([]);
  const [medicalNodes, setMedicalNodes] = useState<DemoWorkflowNode[]>([]);
  const [loanCollectionId, setLoanCollectionId] = useState<string | null>(null);
  const [builderDid, setBuilderDid] = useState<string | null>(null);

  const fetchLoanWorkflow = async () => {
    try {
      const loan = await request<LoanWorkflowResponse>("/demo/loan-workflow");
      setLoanNodes(loan.nodes ?? []);
      setLoanCollectionId(loan.collectionId ?? null);
      setBuilderDid(loan.builderDid ?? null);
      return loan.builderDid ?? null;
    } catch {
      setLoanNodes([]);
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      await fetchLoanWorkflow();
      try {
        const med = await request<{ nodes: DemoWorkflowNode[] }>("/demo/medical-workflow");
        setMedicalNodes(med.nodes ?? []);
      } catch {
        setMedicalNodes([]);
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

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoanError(null);
    setLoanResult(null);
    setLoanRunId(null);
    setLoanCompletedNodeIds([]);
    setLoanRunStatus(null);

    if (!nillionClient || !did) {
      setLoanError("Connect your wallet to Nillion first.");
      return;
    }

    if (!loanCollectionId) {
      setLoanError("Loan collection is not configured. Contact the app operator.");
      return;
    }

    let currentBuilderDid = builderDid;
    if (!currentBuilderDid) {
      currentBuilderDid = await fetchLoanWorkflow();
      if (!currentBuilderDid) {
        setLoanError("Builder DID not available. Server may be initializing - please try again in a moment.");
        setLoanLoading(false);
        return;
      }
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
      const delegationRes = await request<{ token: string }>("/demo/delegation", {
        method: "POST",
        body: JSON.stringify({ userDid: did, collectionId: loanCollectionId }),
      });

      if (!delegationRes.token) {
        throw new Error("Failed to get delegation token from server");
      }

      const delegatedClient = await setDelegationToken(delegationRes.token);

      const createResponse = await delegatedClient.createData({
        owner: did,
        collection: loanCollectionId,
        data: [
          {
            fullName: loanForm.fullName,
            income,
            existingDebt,
            age,
            country: loanForm.country,
            requestedAmount,
          },
        ],
        acl: {
          grantee: currentBuilderDid,
          read: true,
          write: false,
          execute: true,
        },
      });

      const firstNode = Object.values(createResponse)[0];
      const createdIds = firstNode?.data?.created ?? [];
      const documentId = createdIds[0];
      if (!documentId) {
        throw new Error("NilDB did not return a created document id");
      }

      const stateKey = `${loanCollectionId}:${documentId}`;

      const res = await request<LoanSubmissionResponse>("/demo/loan-app", {
        method: "POST",
        body: JSON.stringify({ stateKey }),
      });

      setLoanResult({ ...res, stateKey });
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
    const age = Number(medicalForm.age);
    if (!medicalForm.symptoms || Number.isNaN(age)) {
      setMedicalError("Please describe symptoms and provide age.");
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
    } catch (err: any) {
      setMedicalError(err instanceof Error ? err.message : "Demo failed");
    } finally {
      setMedicalLoading(false);
    }
  };

  const medicalActiveStep = medicalLoading ? 1 : medicalResult || medicalError ? medicalNodes.length : 0;

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
          <p className="text-xs text-zinc-500">Encrypted inputs, public decisions demo</p>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] gap-10">
          <div>
          <h1 className="text-3xl font-bold mb-2">Nillion Demo – Loan Application</h1>
          <p className="text-sm text-zinc-400 mb-6">
            Submit a sample loan application. Inputs are stored in Nillion-backed state; ZecFlow only uses the decision summary
            for automation signals.
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

          <aside className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">Loan workflow blocks</h3>
            <p className="text-xs text-zinc-500 mb-3">
              As you submit the form, blocks light up to show how the public workflow progresses over encrypted inputs.
            </p>
            <div className="space-y-2 text-xs">
              {loanNodes.length === 0 && (
                <p className="text-zinc-500 text-[11px]">No workflow graph found for demo loan workflow.</p>
              )}
              {loanNodes.map((node) => {
                const isCompleted = loanCompletedNodeIds.includes(node.id);
                const isRunning = loanLoading || (loanRunStatus === "running" || loanRunStatus === "pending");
                const label = node.alias || node.blockId || node.type;
                return (
                  <div
                    key={node.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      isCompleted
                        ? "border-[#6758c1] bg-[#6758c1]/10 shadow-[0_0_20px_rgba(103,88,193,0.4)]"
                        : "border-zinc-800 bg-zinc-950"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        isCompleted ? "bg-[#6758c1]" : isRunning ? "bg-zinc-500 animate-pulse" : "bg-zinc-700"
                      }`}
                    />
                    <span className="text-zinc-200 truncate" title={label}>{label}</span>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>

        <section className="border-t border-zinc-800 pt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] gap-10">
          <div>
          <h2 className="text-2xl font-bold mb-2">Nillion Demo – Medical Diagnosis</h2>
          <p className="text-sm text-zinc-400 mb-6">
            Submit a short description of symptoms. You can choose to shield the result so only the holder of the key can
            decrypt the detailed outcome.
          </p>
          <form onSubmit={handleMedicalSubmit} className="space-y-4 max-w-xl">
            <textarea
              className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm w-full min-h-[80px]"
              placeholder="Describe the symptoms (e.g. fever, cough, chest pain)"
              value={medicalForm.symptoms}
              onChange={(e) => setMedicalForm((f) => ({ ...f, symptoms: e.target.value }))}
            />
            <div className="flex items-center gap-4">
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm w-32"
                placeholder="Age"
                value={medicalForm.age}
                onChange={(e) => setMedicalForm((f) => ({ ...f, age: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={medicalForm.shieldResult}
                  onChange={(e) => setMedicalForm((f) => ({ ...f, shieldResult: e.target.checked }))}
                />
                Shield detailed result (platform only sees that evaluation completed)
              </label>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-600 text-sm font-medium text-black"
            >
              Run Medical Demo
            </button>
          </form>
          {medicalError && <p className="text-sm text-red-400 mt-3">{medicalError}</p>}
          {medicalResult && (
            <div className="mt-4 text-sm text-zinc-300 space-y-1">
              <div>Status: <span className="font-semibold text-white">{medicalResult.status}</span></div>
              <div>
                Result shielded: <span className="font-semibold text-white">{medicalResult.resultShielded ? "yes" : "no"}</span>
              </div>
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

          <aside className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">Medical workflow blocks</h3>
            <p className="text-xs text-zinc-500 mb-3">
              Blocks glow as the public medical workflow progresses, with optional shielding of the detailed result.
            </p>
            <div className="space-y-2 text-xs">
              {medicalNodes.length === 0 && (
                <p className="text-zinc-500 text-[11px]">No workflow graph found for demo medical workflow.</p>
              )}
              {medicalNodes.map((node, idx) => {
                const step = idx + 1;
                const active = step <= medicalActiveStep;
                const label = node.alias || node.blockId || node.type;
                return (
                  <div
                    key={node.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      active
                        ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.45)]"
                        : "border-zinc-800 bg-zinc-950"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        active ? "bg-emerald-400" : "bg-zinc-700"
                      }`}
                    />
                    <span className="text-zinc-200 truncate" title={label}>{label}</span>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
