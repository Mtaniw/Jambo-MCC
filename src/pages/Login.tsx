import React, { useState, useMemo } from 'react';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, getDocs, query, collection, limit } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { LogIn, UserPlus, ShieldCheck, AlertCircle, CheckCircle2, Info, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { Logo } from '../components/Logo';
import { useSettings } from '../hooks/useSettings';

export default function Login() {
  const { settings } = useSettings();
  const [isRegistering, setIsRegistering] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('Cashier');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength;
  }, [password]);

  const strengthLabel = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][passwordStrength];
  const strengthColor = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-blue-500'][passwordStrength];

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const getFriendlyErrorMessage = (err: any) => {
    const code = err.code;
    const message = err.message;

    switch (code) {
      case 'auth/user-not-found': return 'No account found with this email.';
      case 'auth/wrong-password': return 'Incorrect password. Please try again.';
      case 'auth/email-already-in-use': return 'This email is already registered.';
      case 'auth/weak-password': return 'Password should be at least 6 characters.';
      case 'auth/invalid-email': return 'Please enter a valid email address.';
      case 'auth/network-request-failed': return 'Network error. Please check your connection.';
      case 'auth/popup-blocked': return 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
      case 'auth/popup-closed-by-user': return 'The login window was closed before completion.';
      case 'auth/cancelled-by-user': return 'Login was cancelled.';
      default: 
        console.error('Auth Error Details:', err);
        return message || 'An unexpected error occurred. Please try again.';
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      const isFirstAdmin = user.email?.toLowerCase() === 'mtaniwambura@gmail.com';
      
      if (!docSnap.exists()) {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)));
        const noUsersExist = usersSnap.empty;

        await setDoc(docRef, {
          fullName: user.displayName || 'New User',
          username: user.email?.split('@')[0] || 'user',
          role: (isFirstAdmin || noUsersExist) ? 'Super User' : 'Cashier',
          mccIds: [],
          status: (isFirstAdmin || noUsersExist) ? 'active' : 'pending',
          email: user.email,
          createdAt: new Date().toISOString()
        });
      } else if (isFirstAdmin) {
        // Ensure the specific admin email always has the correct role and status
        await updateDoc(docRef, {
          role: 'Super User',
          status: 'active'
        });
      }

      if (isFirstAdmin) {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (isRegistering && passwordStrength < 2) {
      setError('Please choose a stronger password.');
      return;
    }

    setLoading(true);
    try {
      if (isRegistering) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const isFirstAdmin = email.toLowerCase() === 'mtaniwambura@gmail.com';
        
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)));
        const noUsersExist = usersSnap.empty;

        await setDoc(doc(db, 'users', result.user.uid), {
          fullName,
          username: username || email.split('@')[0],
          role: (isFirstAdmin || noUsersExist) ? 'Super User' : role,
          mccIds: [],
          status: (isFirstAdmin || noUsersExist) ? 'active' : 'pending',
          email,
          createdAt: new Date().toISOString()
        });
        setSuccess((isFirstAdmin || noUsersExist) ? 'Super User account created! You can now sign in.' : 'Account created! Please wait for admin approval.');
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const isFirstAdmin = email.toLowerCase() === 'mtaniwambura@gmail.com';
        
        if (isFirstAdmin) {
          // Force update role and status for the primary admin email on every login
          await updateDoc(doc(db, 'users', result.user.uid), {
            role: 'Super User',
            status: 'active'
          });
          navigate('/admin');
        } else {
          const docSnap = await getDoc(doc(db, 'users', result.user.uid));
          if (docSnap.exists() && (docSnap.data().role === 'Super User' || docSnap.data().role === 'Admin')) {
            navigate('/admin');
          } else {
            navigate('/');
          }
        }
      }
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setError('Please enter your email address first.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('Password reset email sent! Please check your inbox.');
      setTimeout(() => setShowForgotPassword(false), 5000);
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center relative overflow-hidden p-2 sm:p-4">
      {/* Background Split */}
      <div className="absolute inset-0 z-0 flex flex-col md:flex-row">
        <div className="w-full md:w-1/2 bg-gradient-to-br from-primary via-primary-container to-primary-fixed-dim">
          <div 
            className="h-full w-full opacity-20 bg-cover bg-center" 
            style={{ backgroundImage: `url('${settings.loginBgUrl || "https://picsum.photos/seed/factory/1920/1080"}')` }}
          ></div>
        </div>
        <div className="hidden md:block md:w-1/2 bg-surface-container-low"></div>
      </div>

      {/* Login Card - Branded with rounded-[2rem] and font-black */}
      <div className="relative z-10 w-full max-w-4xl flex flex-col md:flex-row items-stretch gap-0 md:shadow-2xl rounded-[1.5rem] md:rounded-[2rem] overflow-hidden bg-white">
        {/* Sidebar */}
        <div className="md:w-1/3 bg-primary p-5 md:p-8 flex flex-col justify-between text-white border-b md:border-b-0 md:border-r border-white/10 shrink-0">
          <div>
            <Logo variant="white" className="h-10 md:h-12 w-auto mb-2" />
            <div className="h-1 w-10 bg-secondary-container mb-4 rounded-full"></div>
            <p className="text-lg font-black leading-tight tracking-tighter mb-1">{settings.systemName || 'MCC Management System'}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">{settings.companyName || 'Jambo Food Products Ltd'}</p>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2.5 bg-white/10 p-3 rounded-xl border border-white/5 backdrop-blur-sm">
              <div className="p-1.5 bg-secondary-container rounded-lg text-primary shadow-inner">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black">Secure Access</p>
                <p className="text-[8px] uppercase tracking-[0.2em] opacity-70">Authenticated</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form area */}
        <div className="md:flex-1 bg-white p-5 md:p-8">
          <div className="mb-4">
            <h2 className="text-2xl font-black text-on-surface mb-0.5 tracking-tighter">
              {showForgotPassword ? 'Reset Password' : isRegistering ? 'Karibu! 👋' : 'Karibu Tena! 👋'}
            </h2>
            <p className="text-on-surface-variant font-medium text-xs">
              {showForgotPassword 
                ? 'Enter your email to receive a reset link' 
                : isRegistering 
                  ? 'Unda akaunti yako mpya (Create account)' 
                  : 'Ingia kwenye akaunti yako (Sign in)'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-2 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2 text-xs">
              <CheckCircle2 size={14} /> {success}
            </div>
          )}

          {showForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest opacity-60 ml-1">Email Address</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 font-bold text-xs"
                  placeholder="email@example.com"
                />
              </div>
              <button
                disabled={loading}
                type="submit"
                className="w-full bg-primary text-white font-black py-3 rounded-xl shadow-lg hover:shadow-primary/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2 disabled:transform-none"
              >
                {loading ? 'Processing...' : 'Send Reset Link'}
                <LogIn size={18} />
              </button>
              <button 
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="w-full text-[9px] font-black uppercase tracking-widest text-on-surface-variant hover:text-primary py-1.5 transition-colors mt-1"
              >
                Back to Login
              </button>
            </form>
          ) : (
            <form onSubmit={handleEmailAuth} className="space-y-2.5">
              {isRegistering && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-60 ml-1">Full Name</label>
                      <input
                        required
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 font-bold text-xs"
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-60 ml-1">Username</label>
                      <input
                        required
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 font-bold text-xs"
                        placeholder="johndoe"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest opacity-60 ml-1">Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 font-bold text-xs appearance-none"
                    >
                      <option value="Cashier">Cashier</option>
                      <option value="Quality Controller">Quality Controller</option>
                      <option value="Supervisor">Supervisor</option>
                      <option value="Manager">Manager</option>
                      <option value="Director">Director</option>
                      <option value="Factory Clerk">Factory Clerk</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest opacity-60 ml-1">Email</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 font-bold text-xs"
                  placeholder="email@example.com"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center mb-0.5">
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-60 ml-1">Password</label>
                  {!isRegistering && (
                    <button 
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-[8px] font-black text-primary uppercase tracking-widest hover:underline"
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-primary/20 font-bold text-xs"
                    placeholder="••••••••"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                
                {isRegistering && password && (
                  <div className="space-y-1 mt-1 px-1">
                    <div className="flex justify-between items-center text-[7px] font-black uppercase tracking-widest opacity-60">
                      <span>Strength: {strengthLabel}</span>
                    </div>
                    <div className="h-0.5 w-full bg-surface-container-low rounded-full overflow-hidden flex gap-0.5">
                      {[1, 2, 3, 4].map((i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "h-full flex-1 transition-all duration-500",
                            i <= passwordStrength ? strengthColor : "bg-transparent"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                disabled={loading}
                type="submit"
                className="w-full bg-primary text-white font-black py-3 rounded-xl shadow-lg hover:shadow-primary/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2 disabled:transform-none"
              >
                {loading ? 'Processing...' : isRegistering ? 'Complete Sign Up' : 'Sign In Now'}
                <LogIn size={16} />
              </button>
            </form>
          )}

          {!showForgotPassword && (
            <div className="mt-4 flex flex-col gap-2.5">
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-outline-variant/15"></span></div>
                <div className="relative flex justify-center text-[8px] font-black uppercase tracking-[0.3em]"><span className="bg-white px-3 text-on-surface-variant">Social Login</span></div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-white border border-outline-variant/30 text-on-surface font-black py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-surface-container-low hover:border-primary/20 transition-all text-[10px] shadow-sm uppercase tracking-wider"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-3.5 h-3.5" />
                Google Sign In
              </button>

              <button
                onClick={() => { setIsRegistering(!isRegistering); setError(''); setSuccess(''); }}
                className="text-[9px] text-primary font-black uppercase tracking-widest text-center hover:bg-primary/5 py-1.5 rounded-lg transition-all"
              >
                {isRegistering ? 'Known User? Sign In' : "No Account? Request Access"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
