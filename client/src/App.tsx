import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/EmptyState';

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

function LoginPage() {
  return (
    <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">Sign In to GuessLess</h2>
      <EmptyState
        title="Authentication Ready"
        description="F-01 Authentication feature branch will connect this form to POST /api/v1/auth/login."
      />
    </div>
  );
}

function AvailableSurveysPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Available Surveys</h2>
      <EmptyState
        title="No open surveys found"
        description="Check back later for newly published surveys."
      />
    </div>
  );
}

function MyResponsesPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">My Submissions</h2>
      <EmptyState
        title="No responses yet"
        description="Surveys you complete will appear here with confirmation dates."
      />
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

export function App() {
  const [currentUser] = useState<any>(null);

  return (
    <BrowserRouter>
      <Layout user={currentUser}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/available" element={<AvailableSurveysPage />} />
          <Route path="/my-responses" element={<MyResponsesPage />} />
          <Route path="/my-surveys" element={<MySurveysPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
