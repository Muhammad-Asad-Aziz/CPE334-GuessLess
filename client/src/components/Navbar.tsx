import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, ClipboardList, CheckCircle, BarChart3, PlusCircle, Menu, X } from 'lucide-react';
import { apiFetch, authStorage } from '../lib/apiClient';

export interface UserInfo {
  id: string;
  displayName: string;
  role: 'RESPONDENT' | 'SURVEY_OWNER' | 'ADMIN';
}

interface NavbarProps {
  user?: UserInfo | null;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      authStorage.clearToken();
      if (onLogout) {
        onLogout();
      }
      setMobileMenuOpen(false);
      navigate('/login');
    }
  };

  const roleLabel = (role: string) => {
    if (role === 'SURVEY_OWNER') return 'Survey Owner';
    if (role === 'RESPONDENT') return 'Respondent';
    if (role === 'ADMIN') return 'Administrator';
    return role;
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-6">
            <Link
              to={user?.role === 'SURVEY_OWNER' ? '/my-surveys' : user?.role === 'RESPONDENT' ? '/available' : '/'}
              className="flex items-center space-x-2 text-[#006B3C] font-bold text-xl tracking-tight"
            >
              <span className="w-8 h-8 rounded-lg bg-[#006B3C] text-white flex items-center justify-center font-black">
                G
              </span>
              <span>GuessLess</span>
            </Link>

            {/* Desktop Navigation Links */}
            {user && (
              <nav className="hidden md:flex space-x-2">
                {user.role === 'RESPONDENT' && (
                  <>
                    <Link
                      to="/available"
                      className="text-gray-600 hover:text-[#006B3C] px-3 py-2 text-sm font-medium rounded-md flex items-center gap-1.5 transition-colors"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Available Surveys
                    </Link>
                    <Link
                      to="/my-responses"
                      className="text-gray-600 hover:text-[#006B3C] px-3 py-2 text-sm font-medium rounded-md flex items-center gap-1.5 transition-colors"
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
                      className="text-gray-600 hover:text-[#006B3C] px-3 py-2 text-sm font-medium rounded-md flex items-center gap-1.5 transition-colors"
                    >
                      <BarChart3 className="w-4 h-4" />
                      My Surveys
                    </Link>
                    <Link
                      to="/my-surveys/new"
                      className="text-white bg-[#006B3C] hover:bg-[#0B7A46] px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Create Survey
                    </Link>
                  </>
                )}
                {user.role === 'ADMIN' && (
                  <span className="text-xs text-gray-400 self-center px-2 py-1 bg-gray-50 rounded">
                    Admin Portal
                  </span>
                )}
              </nav>
            )}
          </div>

          {/* Right Header: User profile & Logout / Login button */}
          <div className="flex items-center space-x-3">
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900 leading-tight">
                    {user.displayName}
                  </div>
                  <div className="text-xs text-gray-500 font-medium">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[#EAF6EF] text-[#006B3C]">
                      {roleLabel(user.role)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#006B3C] transition-colors"
                  title="Log out"
                  aria-label="Log out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
                {/* Mobile hamburger menu button */}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#006B3C]"
                  aria-label="Toggle navigation menu"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm font-medium text-[#006B3C] hover:text-[#0B7A46] px-4 py-2 border border-[#006B3C] rounded-md transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mobile navigation dropdown */}
      {mobileMenuOpen && user && (
        <div className="md:hidden border-t border-gray-200 px-4 pt-2 pb-3 space-y-1 bg-white shadow-lg">
          {user.role === 'RESPONDENT' && (
            <>
              <Link
                to="/available"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-gray-700 hover:text-[#006B3C] hover:bg-gray-50 px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
              >
                <ClipboardList className="w-5 h-5" />
                Available Surveys
              </Link>
              <Link
                to="/my-responses"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-gray-700 hover:text-[#006B3C] hover:bg-gray-50 px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                My Responses
              </Link>
            </>
          )}
          {user.role === 'SURVEY_OWNER' && (
            <>
              <Link
                to="/my-surveys"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-gray-700 hover:text-[#006B3C] hover:bg-gray-50 px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
              >
                <BarChart3 className="w-5 h-5" />
                My Surveys
              </Link>
              <Link
                to="/my-surveys/new"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-white bg-[#006B3C] hover:bg-[#0B7A46] px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
              >
                <PlusCircle className="w-5 h-5" />
                Create Survey
              </Link>
            </>
          )}
          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={handleLogout}
              className="w-full text-left text-red-600 hover:bg-red-50 px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
