import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, ClipboardList, CheckCircle, BarChart3 } from 'lucide-react';
import { authStorage } from '../lib/apiClient';

interface UserInfo {
  id: string;
  displayName: string;
  role: 'RESPONDENT' | 'SURVEY_OWNER' | 'ADMIN';
}

interface AppHeaderProps {
  user?: UserInfo | null;
  onLogout?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      authStorage.clearToken();
      navigate('/login');
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center space-x-2 text-[#006B3C] font-bold text-xl tracking-tight">
              <span className="w-8 h-8 rounded-lg bg-[#006B3C] text-white flex items-center justify-center font-black">
                G
              </span>
              <span>GuessLess</span>
            </Link>

            {user && (
              <nav className="hidden md:flex space-x-4">
                {user.role === 'RESPONDENT' && (
                  <>
                    <Link
                      to="/available"
                      className="text-gray-600 hover:text-[#006B3C] px-3 py-2 text-sm font-medium flex items-center gap-1.5"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Available Surveys
                    </Link>
                    <Link
                      to="/my-responses"
                      className="text-gray-600 hover:text-[#006B3C] px-3 py-2 text-sm font-medium flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" />
                      My Responses
                    </Link>
                  </>
                )}
                {user.role === 'SURVEY_OWNER' && (
                  <>
                    <Link
                      to="/my-surveys"
                      className="text-gray-600 hover:text-[#006B3C] px-3 py-2 text-sm font-medium flex items-center gap-1.5"
                    >
                      <BarChart3 className="w-4 h-4" />
                      My Surveys
                    </Link>
                    <Link
                      to="/my-surveys/new"
                      className="text-white bg-[#006B3C] hover:bg-[#0B7A46] px-3 py-2 rounded text-sm font-medium"
                    >
                      Create Survey
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-gray-900">{user.displayName}</div>
                  <div className="text-xs text-gray-500 font-mono">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#EAF6EF] text-[#006B3C]">
                      {user.role}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#006B3C]"
                  title="Log out"
                  aria-label="Log out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm font-medium text-[#006B3C] hover:text-[#0B7A46] px-4 py-2 border border-[#006B3C] rounded-md hover:bg-[#EAF6EF] transition-colors"
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

