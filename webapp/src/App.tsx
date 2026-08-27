import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { SessionsView } from "./views/SessionsView";
import { FeaturesView } from "./views/FeaturesView";
import { FeatureDetail } from "./views/FeatureDetail";

export function App() {
  return (
    <BrowserRouter>
      <nav className="flex gap-4 border-b px-6 py-3">
        <NavLink to="/sessions" className="text-blue-600">
          Sessions
        </NavLink>
        <NavLink to="/features" className="text-blue-600">
          Features
        </NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<SessionsView />} />
        <Route path="/sessions" element={<SessionsView />} />
        <Route path="/features" element={<FeaturesView />} />
        <Route path="/features/:id" element={<FeatureDetail />} />
      </Routes>
    </BrowserRouter>
  );
}