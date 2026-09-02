import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Lock, User, Phone, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const { loginEmail, register, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", mobile: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) navigate("/dashboard"); }, [user, navigate]);

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await loginEmail(form.email, form.password);
      } else {
        await register(form);
      }
      toast.success("Welcome to Edu-Crack!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-5 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/20 blur-[130px]" />
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Home
      </button>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 orb mx-auto mb-4 animate-float" />
          <h1 className="font-display text-3xl font-bold">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-slate-400 text-sm mt-2">Your AI professor is waiting.</p>
        </div>

        <div className="glass rounded-2xl p-7">
          <button
            onClick={googleLogin}
            data-testid="google-login-btn"
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 rounded-xl hover:bg-slate-100 transition-colors active:scale-[0.98]"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="" className="w-5 h-5" />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500 font-mono">OR</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <Field icon={User} testid="name-input" placeholder="Full name" value={form.name}
                onChange={(v) => setForm({ ...form, name: v })} />
            )}
            <Field icon={Mail} testid="email-input" type="email" placeholder="Email" value={form.email}
              onChange={(v) => setForm({ ...form, email: v })} />
            <Field icon={Lock} testid="password-input" type="password" placeholder="Password" value={form.password}
              onChange={(v) => setForm({ ...form, password: v })} />
            {mode === "register" && (
              <Field icon={Phone} testid="mobile-input" placeholder="Mobile number (optional)" value={form.mobile}
                onChange={(v) => setForm({ ...form, mobile: v })} />
            )}
            <button
              type="submit"
              disabled={busy}
              data-testid="submit-auth-btn"
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 rounded-xl transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-5">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              data-testid="toggle-auth-mode"
              className="text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, testid, type = "text", placeholder, value, onChange }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
      <input
        data-testid={testid}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={type !== "text" || placeholder.indexOf("optional") === -1}
        className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-indigo-500 transition-colors text-white placeholder:text-slate-500"
      />
    </div>
  );
}
