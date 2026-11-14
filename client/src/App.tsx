import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/EmptyState';
import { LoginPage } from './pages/LoginPage';
import { AdminHomePage } from './pages/AdminHomePage';
import { AvailableSurveysPage } from './pages/respondent/AvailableSurveysPage';
import { TakeSurveyPage } from './pages/respondent/TakeSurveyPage';
import { MyResponsesPage } from './pages/respondent/MyResponsesPage';
import { SubmissionDetailPage } from './pages/respondent/SubmissionDetailPage';
import { UserInfo } from './components/Navbar';
import { apiFetch, authStorage } from './lib/apiClient';

function HomePage() {
  return (
    <div className="py-12 text-center">
      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
        Welcome to <span className="text-[#006B3C]">GuessLess</span>
      </h1>
      <p className="mt-4 max-w-2xl mx-auto text-base text-gray-600 sm:text-lg">
        Survey and Feedback System with privacy-by-design, verified lifecycle guarantees, and responsive mobile-first analytics.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Link
          to="/login"
          className="px-6 py-3 bg-[#006B3C] hover:bg-[#0B7A46] text-white font-medium rounded-md shadow-sm transition-colors"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}

function MySurveysPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">My Surveys</h2>
        <Link
          to="/my-surveys/new"
          className="px-4 py-2 bg-[#006B3C] hover:bg-[#0B7A46] text-white font-medium rounded-md text-sm transition-colors"
        >
          Create Survey
        </Link>
      </div>
      <EmptyState
        title="No surveys created yet"
        description="Create your first survey draft to begin collecting feedback."
        actionText="Create Survey"
        onAction={() => alert('Survey builder will be implemented in F-02!')}
      />
    </div>
  );
}

function NotFoundPage() {
  return (
    <EmptyState
      title="404 — Page Not Found"
      description="The page you are looking for does not exist."
      actionText="Return Home"
      onAction={() => (window.location.href = '/')}
    />
  );
}

function ProtectedRoute({
  children,
}: {
  children: JSX.Element;
}) {
  const token = authStorage.getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RootRedirect({ user }: { user: UserInfo | null }) {
  if (!user) {
    return <HomePage />;
  }
  if (user.role === 'ADMIN') {
    return <AdminHomePage />;
  }
  if (user.role === 'SURVEY_OWNER') {
    return <Navigate to="/my-surveys" replace />;
  }
  if (user.role === 'RESPONDENT') {
    return <Navigate to="/available" replace />;
  }
  return <HomePage />;
}

export function App() {
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const token = authStorage.getToken();
    if (token) {
      apiFetch<UserInfo>('/auth/me')
        .then((res) => setCurrentUser(res.data))
        .catch(() => {
          authStorage.clearToken();
          setCurrentUser(null);
        });
    } else {
      setCurrentUser(null);
    }
  }, []);

  return (
    <BrowserRouter>
      <Layout user={currentUser} onLogout={() => setCurrentUser(null)}>
        <Routes>
          <Route path="/" element={<RootRedirect user={currentUser} />} />
          <Route
            path="/login"
            element={
              <LoginPage
                currentUser={currentUser}
                onLoginSuccess={(u) => setCurrentUser(u as UserInfo)}
              />
            }
          />
          <Route
            path="/available"
            element={
              <ProtectedRoute>
                <AvailableSurveysPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/available/:surveyId"
            element={
              <ProtectedRoute>
                <TakeSurveyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-responses"
            element={
              <ProtectedRoute>
                <MyResponsesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-responses/:surveyId"
            element={
              <ProtectedRoute>
                <SubmissionDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-surveys"
            element={
              <ProtectedRoute>
                <MySurveysPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
