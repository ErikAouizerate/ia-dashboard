import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { SessionsView } from "./views/SessionsView";
import { FeaturesView } from "./views/FeaturesView";
import { FeatureDetail } from "./views/FeatureDetail";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
  }`;

export function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <aside className="w-52 shrink-0 border-r border-gray-200 bg-white">
          <div className="flex h-full flex-col gap-1 px-3 py-4">
            <div className="mb-3 px-3 text-lg font-semibold text-gray-900">ia-dashboard</div>
            <NavLink to="/sessions" className={navLinkClass}>
              Sessions
            </NavLink>
            <NavLink to="/features" className={navLinkClass}>
              Features
            </NavLink>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<SessionsView />} />
            <Route path="/sessions" element={<SessionsView />} />
            <Route path="/features" element={<FeaturesView />} />
            <Route path="/features/:id" element={<FeatureDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}