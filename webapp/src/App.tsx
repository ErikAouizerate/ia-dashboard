import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { SessionsView } from "./views/SessionsView";

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
        <Route path="/features" element={<div className="p-6 text-gray-500">Coming soon.</div>} />
      </Routes>
    </BrowserRouter>
  );
}