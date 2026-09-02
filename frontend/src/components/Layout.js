import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, MessageSquareText, Code2, Trophy, Video,
  Users, BookOpen, LogOut, Dna, Menu, X, Swords,
} from "lucide-react";
import { useState } from "react";

const nav = [
  { to: "/dashboard", label: "Learning DNA", icon: Dna },
  { to: "/tutor", label: "AI Tutor", icon: MessageSquareText },
  { to: "/compiler", label: "Code Lab", icon: Code2 },
  { to: "/quiz", label: "Quiz Arena", icon: Trophy },
  { to: "/battle", label: "Group Battle", icon: Swords },
  { to: "/interview", label: "Mock Interview", icon: Video },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static z-40 h-screen w-72 bg-surface border-r border-slate-800 flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        data-testid="sidebar"
      >
        <div className="px-6 py-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-9 h-9 orb" />
          <div>
            <p className="font-display font-bold text-lg leading-none">Edu-Crack</p>
            <p className="text-[10px] font-mono text-indigo-400 tracking-widest">AI LEARNING</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              data-testid={`nav-${n.to.slice(1)}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent"
                }`
              }
            >
              <n.icon className="w-[18px] h-[18px]" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-500/30 flex items-center justify-center font-bold text-indigo-300">
                {user?.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" data-testid="sidebar-username">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={doLogout}
            data-testid="logout-btn"
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-rose-300 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="lg:hidden sticky top-0 z-20 bg-surface/90 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setOpen(!open)} data-testid="menu-toggle" className="text-slate-300">
            {open ? <X /> : <Menu />}
          </button>
          <span className="font-display font-bold">Edu-Crack</span>
        </div>
        <main className="p-5 lg:p-10 max-w-[1400px] mx-auto relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
