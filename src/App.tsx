import React, { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import PresenceTracker from './components/PresenceTracker';
import BrandingManager from './components/BrandingManager';

// Lazy load pages
const Login = lazy(() => import('./pages/Login'));
const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DailyRegister = lazy(() => import('./pages/DailyRegister'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Funds = lazy(() => import('./pages/Funds'));
const Admin = lazy(() => import('./pages/Admin'));
const Sellers = lazy(() => import('./pages/Sellers'));
const TruckQA = lazy(() => import('./pages/TruckQA'));
const FactoryIntake = lazy(() => import('./pages/FactoryIntake'));
const MilkCans = lazy(() => import('./pages/MilkCans'));
const Rejects = lazy(() => import('./pages/Rejects'));
const WeeklyReport = lazy(() => import('./pages/WeeklyReport'));
const MonthlyReport = lazy(() => import('./pages/MonthlyReport'));
const SupplierMonthlyPerformance = lazy(() => import('./pages/SupplierMonthlyPerformance'));
const TankerWeeklyReport = lazy(() => import('./pages/TankerWeeklyReport'));
const Reports = lazy(() => import('./pages/Reports'));
const RejectReport = lazy(() => import('./pages/RejectReport'));
const MilkCansIssuedReport = lazy(() => import('./pages/MilkCansIssuedReport'));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

function PrivateRoute({ children, roles, pageName }: { children: React.ReactNode; roles?: string[]; pageName?: string }) {
  const { user, profile, loading, isAuthReady, effectiveRole, permissions } = useAuth();

  if (!isAuthReady || loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (profile?.status === 'pending' && profile.email?.toLowerCase() !== 'mtaniwambura@gmail.com') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-xl shadow-lg border border-outline-variant/20">
          <h2 className="text-2xl font-bold text-primary mb-4">Account Pending Approval</h2>
          <p className="text-on-surface-variant">Your account is pending approval by an administrator. You will be notified once approved.</p>
        </div>
      </div>
    );
  }

  // Admin and Super User always have access (Fail-safe for primary admin)
  const isPrimaryAdmin = user?.email?.toLowerCase() === 'mtaniwambura@gmail.com';
  if (effectiveRole === 'Admin' || effectiveRole === 'Super User' || isPrimaryAdmin) {
    return <Layout>{children}</Layout>;
  }

  // Check custom user permissions first
  if (profile?.customPermissions?.pages && pageName) {
    const hasCustomPerm = profile.customPermissions.pages[pageName];
    if (hasCustomPerm === false) return <Navigate to="/" />;
    if (hasCustomPerm === true) return <Layout>{children}</Layout>;
  }

  // Check granular role-based permissions
  if (permissions && effectiveRole && pageName && permissions[effectiveRole]) {
    const hasPerm = permissions[effectiveRole].pages?.[pageName];
    if (hasPerm === false) return <Navigate to="/" />;
  }

  if (roles && effectiveRole && !roles.includes(effectiveRole)) {
    return <Navigate to="/" />;
  }

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrandingManager />
        <PresenceTracker />
        <Router>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<PrivateRoute pageName="Home"><Home /></PrivateRoute>} />
              <Route path="/dashboard" element={<PrivateRoute pageName="Dashboard"><Dashboard /></PrivateRoute>} />
              <Route path="/daily-register" element={<PrivateRoute pageName="Daily Register" roles={['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Viewer']}><DailyRegister /></PrivateRoute>} />
              <Route path="/expenses" element={<PrivateRoute pageName="Expenses" roles={['Super User', 'Admin', 'Cashier', 'Supervisor', 'Viewer']}><Expenses /></PrivateRoute>} />
              <Route path="/funds" element={<PrivateRoute pageName="Funds" roles={['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Viewer']}><Funds /></PrivateRoute>} />
              <Route path="/truck-qa" element={<PrivateRoute pageName="Truck & QA" roles={['Super User', 'Admin', 'Quality Controller', 'Supervisor', 'Cashier', 'Factory Clerk', 'Manager', 'Director', 'Viewer']}><TruckQA /></PrivateRoute>} />
              <Route path="/factory-intake" element={<PrivateRoute pageName="Factory Intake" roles={['Super User', 'Admin', 'Factory Clerk', 'Viewer']}><FactoryIntake /></PrivateRoute>} />
              <Route path="/milk-cans" element={<PrivateRoute pageName="Milk Cans" roles={['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer']}><MilkCans /></PrivateRoute>} />
              <Route path="/rejects" element={<PrivateRoute pageName="Rejects"><Rejects /></PrivateRoute>} />
              <Route path="/reports" element={<PrivateRoute pageName="Reports" roles={['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer', 'Factory Clerk']}><Reports /></PrivateRoute>} />
              <Route path="/reports/rejects" element={<PrivateRoute pageName="Reports" roles={['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer', 'Factory Clerk']}><RejectReport /></PrivateRoute>} />
              <Route path="/reports/milk-cans-issued" element={<PrivateRoute pageName="Reports" roles={['Super User', 'Admin', 'Cashier', 'Quality Controller', 'Supervisor', 'Manager', 'Director', 'Viewer']}><MilkCansIssuedReport /></PrivateRoute>} />
              <Route path="/reports/weekly" element={<PrivateRoute pageName="Reports" roles={['Super User', 'Admin', 'Cashier', 'Supervisor', 'Manager', 'Director', 'Viewer']}><WeeklyReport /></PrivateRoute>} />
              <Route path="/reports/monthly" element={<PrivateRoute pageName="Reports" roles={['Super User', 'Admin', 'Cashier', 'Supervisor', 'Manager', 'Director', 'Viewer']}><MonthlyReport /></PrivateRoute>} />
              <Route path="/reports/supplier-performance" element={<PrivateRoute pageName="Reports" roles={['Super User', 'Admin', 'Supervisor', 'Manager', 'Director', 'Cashier', 'Quality Controller']}><SupplierMonthlyPerformance /></PrivateRoute>} />
              <Route path="/reports/tanker-weekly" element={<PrivateRoute pageName="Reports" roles={['Super User', 'Admin', 'Cashier', 'Supervisor', 'Manager', 'Director']}><TankerWeeklyReport /></PrivateRoute>} />
              <Route path="/admin" element={<PrivateRoute pageName="Admin" roles={['Super User', 'Admin']}><Admin /></PrivateRoute>} />
              <Route path="/sellers" element={<PrivateRoute pageName="Sellers" roles={['Super User', 'Admin', 'Manager', 'Director']}><Sellers /></PrivateRoute>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
