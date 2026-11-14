import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const AdminHomePage: React.FC = () => {
  return (
    <div className="py-12 px-4 max-w-3xl mx-auto text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-[#006B3C] mb-6">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl mb-4">
        Administrator Portal
      </h1>
      <p className="text-lg text-gray-600 mb-8 max-w-xl mx-auto">
        Signed in as Administrator. Account administration arrives in Sprint 3.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 text-left max-w-md mx-auto">
        <span className="font-semibold block mb-1">Notice:</span>
        System Administrators have access strictly to user account management (Sprint 3) and cannot access survey data, responses, or summaries (BR-08).
      </div>
    </div>
  );
};
