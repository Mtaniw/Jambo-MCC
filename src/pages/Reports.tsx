import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Calendar, 
  Truck, 
  AlertTriangle, 
  BarChart3,
  ChevronRight,
  TrendingUp,
  Users,
  Settings,
  MapPin,
  Milk
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';

export default function Reports() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const reportGroups = [
    {
      title: "Milk Collection Reports",
      description: "Daily, weekly and monthly collection summaries",
      reports: [
        { 
          name: 'Weekly Report', 
          path: '/reports/weekly', 
          icon: FileText, 
          description: 'Summary of milk collection by week',
          roles: ['Super User', 'Admin', 'Cashier', 'Supervisor', 'Manager', 'Director', 'Viewer'] 
        },
        { 
          name: 'Monthly Report', 
          path: '/reports/monthly', 
          icon: Calendar, 
          description: 'Detailed monthly collection breakdown',
          roles: ['Super User', 'Admin', 'Cashier', 'Supervisor', 'Manager', 'Director', 'Viewer'] 
        },
        { 
          name: 'Supplier Performance', 
          path: '/reports/supplier-performance', 
          icon: TrendingUp, 
          description: 'Monthly performance metrics per supplier',
          roles: ['Super User', 'Admin', 'Supervisor', 'Manager', 'Director'] 
        }
      ]
    },
    {
      title: "Quality & Logistics Reports",
      description: "Rejects and tanker transportation tracking",
      reports: [
        { 
          name: 'Reject Report', 
          path: '/reports/rejects', 
          icon: AlertTriangle, 
          description: 'Summary of rejected milk with reasons',
          roles: ['Super User', 'Admin', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer', 'Cashier', 'Factory Clerk'] 
        },
        { 
          name: 'Milk Cans Issued Report', 
          path: '/reports/milk-cans-issued', 
          icon: Milk, 
          description: 'Tracking of milk cans issuance and returns',
          roles: ['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer'] 
        },
        {
          name: 'Tanker Report', 
          path: '/reports/tanker-weekly', 
          icon: Truck, 
          description: 'Weekly tanker dispatch and receipt logs',
          roles: ['Super User', 'Admin', 'Cashier', 'Supervisor', 'Manager', 'Director'] 
        }
      ]
    }
  ];

  const hasAccess = (roles: string[]) => profile && roles.includes(profile.role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Reports Center</h1>
        <p className="text-on-surface-variant text-sm">Central hub for all system reports and analytics</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {reportGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="w-1 h-6 bg-primary rounded-full"></div>
              <div>
                <h2 className="font-bold text-on-surface">{group.title}</h2>
                <p className="text-xs text-on-surface-variant">{group.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {group.reports.filter(r => hasAccess(r.roles)).map((report, idx) => (
                <button
                  key={idx}
                  onClick={() => navigate(report.path)}
                  className="flex items-center gap-4 p-4 bg-white border border-outline-variant/20 rounded-xl hover:shadow-md hover:border-primary/30 transition-all group text-left"
                >
                  <div className="p-3 bg-surface-container-low rounded-lg text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <report.icon size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors">{report.name}</h3>
                    <p className="text-xs text-on-surface-variant">{report.description}</p>
                  </div>
                  <ChevronRight size={20} className="text-outline-variant group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Stats Summary */}
      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/20">
            <BarChart3 size={24} />
          </div>
          <div>
            <h3 className="font-bold text-on-surface">Data-Driven Insights</h3>
            <p className="text-sm text-on-surface-variant">Access real-time data to monitor MCC performance and supplier quality.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="text-center px-6 border-r border-outline-variant/20">
            <p className="text-2xl font-black text-primary">5+</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Report Types</p>
          </div>
          <div className="text-center px-6">
            <p className="text-2xl font-black text-primary">Real-time</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Data Sync</p>
          </div>
        </div>
      </div>
    </div>
  );
}
