import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { authService } from "@/services/auth";

type AuthMode = "signin" | "signup";

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white selection:bg-purple-500/30 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 sm:p-8 shadow-2xl shadow-black/60">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <img src="/zecflow-logo.png" alt="ZecFlow" className="h-20 w-auto object-contain" />
        </div>

        <div className="flex flex-col gap-4 mb-6">
            <div className="inline-flex self-start rounded-full border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`px-3 py-1 rounded-full transition-colors ${
                  mode === "signin"
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`px-3 py-1 rounded-full transition-colors ${
                  mode === "signup"
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Create account
              </button>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {mode === "signin" ? "Sign in to ZecFlow" : "Create your ZecFlow account"}
              </h1>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                {mode === "signin"
                  ? "Use your email and password to access your workflows."
                  : "Start building private, block-based workflows with Zcash and Nillion."}
              </p>
            </div>
          </div>

        {mode === "signin" ? <SigninForm /> : <SignupForm switchToSignin={() => setMode("signin")} />}
      </div>
    </div>
  );
}

function SigninForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authService.login(email, password);
      localStorage.setItem("zecflow_access_token", res.tokens.accessToken);
      localStorage.setItem("zecflow_refresh_token", res.tokens.refreshToken);
      navigate("/dashboard");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to sign in";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-2">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-2">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
          placeholder="••••••••"
        />
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span />
        <button
          type="button"
          className="hover:text-white transition-colors"
        >
          Forgot password?
        </button>
      </div>
      {error && (
        <div className="text-xs text-red-400 bg-red-950/50 border border-red-900/70 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      <div className="pt-1">
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}

function SignupForm({ switchToSignin }: { switchToSignin: () => void }) {
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await authService.register({
        name,
        email,
        password,
        organizationName: organization || `${name}'s organization`,
      });
      localStorage.setItem("zecflow_access_token", res.tokens.accessToken);
      localStorage.setItem("zecflow_refresh_token", res.tokens.refreshToken);
      navigate("/dashboard");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create account";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-2">Full name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
          placeholder="Ada Lovelace"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-2">Organization</label>
        <input
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
          placeholder="Your team or company"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-300 mb-2">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
          placeholder="you@company.com"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-2">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"
            placeholder="Repeat password"
          />
        </div>
      </div>
      {error && (
        <div className="text-xs text-red-400 bg-red-950/50 border border-red-900/70 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      <div className="pt-1">
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </Button>
      </div>
      <p className="text-xs text-zinc-400 text-center">
        Already have an account?{" "}
        <button
          type="button"
          onClick={switchToSignin}
          className="text-[#6758c1] hover:text-[#5344ad] font-medium transition-colors"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}
