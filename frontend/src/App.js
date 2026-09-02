import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { api, setToken } from "@/lib/api";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Tutor from "@/pages/Tutor";
import Compiler from "@/pages/Compiler";
import Quiz from "@/pages/Quiz";
import Battle from "@/pages/Battle";
import Interview from "@/pages/Interview";
import Friends from "@/pages/Friends";
import Subjects from "@/pages/Subjects";

function AuthCallback() {
  const { setUser } = useAuth();
  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash;
      const sid = new URLSearchParams(hash.replace("#", "")).get("session_id");
      if (!sid) { window.location.href = "/dashboard"; return; }
      try {
        const res = await api.post("/auth/session", { session_id: sid });
        if (res.data.session_token) setToken(res.data.session_token);
        setUser(res.data.user);
      } catch (e) {}
      window.history.replaceState({}, "", "/dashboard");
      window.location.href = "/dashboard";
    };
    run();
  }, [setUser]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-center">
        <div className="w-16 h-16 orb animate-spin-slow mx-auto mb-4" />
        <p className="text-slate-400 font-mono text-sm">Signing you in…</p>
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-14 h-14 orb animate-spin-slow" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tutor" element={<Tutor />} />
        <Route path="/compiler" element={<Compiler />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/battle" element={<Battle />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/subjects" element={<Subjects />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App grain">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" theme="dark" richColors />
          <AppRouter />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
