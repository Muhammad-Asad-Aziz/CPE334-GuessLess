import React from 'react';
import { Navbar, UserInfo } from './Navbar';

interface LayoutProps {
  children: React.ReactNode;
  user?: UserInfo | null;
  onLogout?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7F6] overflow-x-hidden">
      <Navbar user={user} onLogout={onLogout} />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-500">
        GuessLess Survey & Feedback System &bull; Theme 10
      </footer>
    </div>
  );
};

