import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import AuthPage from './pages/AuthPage';
import UploadPage from './pages/UploadPage';
import PreviewPage from './pages/PreviewPage';
import MappingPage from './pages/MappingPage';
import CleaningPage from './pages/CleaningPage';
import ValidationPage from './pages/ValidationPage';
import HistoryPage from './pages/HistoryPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import AppShell from './components/AppShell';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading...</div>;
  return user ? <>{children}</> : <Navigate to="/auth" replace />;
};

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="cleaning" element={<CleaningPage />} />
            <Route path="preview" element={<PreviewPage />} />
            <Route path="mapping" element={<MappingPage />} />
            <Route path="validations" element={<ValidationPage />} />
            <Route path="validation" element={<ValidationPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
