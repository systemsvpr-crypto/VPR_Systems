import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { supabase } from '../supabase';


const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  useEffect(() => {
    // Clear language hint on load
    localStorage.removeItem('hasSeenLanguageHint');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !user) {
        console.error('Login error:', error || 'User not found');
        toast.error('Invalid credentials');
        setSubmitting(false);
        return;
      }

      console.log('User found:', user.username);

      // Password check (plain text as per existing requirement)
      if (user.password !== password) {
        toast.error('Invalid credentials');
        setSubmitting(false);
        return;
      }

      if (user.is_active === false) {
        toast.error('Your account has been deactivated. Please contact the administrator.');
        setSubmitting(false);
        return;
      }

      toast.success('Login successful!');

      // Compatibility object
      const userForStore = {
        ...user,
        Name: user.full_name,
        Admin: (user.role && user.role.toLowerCase() === 'admin') ? 'Yes' : 'No'
      };

      localStorage.setItem('user', JSON.stringify(userForStore));
      login(userForStore);

      navigate("/my-profile", { replace: true });

    } catch (err) {
      console.error('Login exception:', err);
      toast.error('An unexpected error occurred during login');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-[420px] w-full bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-primary mb-2 tracking-tight">VPR Systems</h1>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-2">Please enter your details to sign in.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <InputField
              id="username" label="Username" type="text"
              value={username} onChange={e => setUsername(e.target.value)}
              icon={User} placeholder="Enter your username"
            />
            <InputField
              id="password" label="Password" type={showPassword ? "text" : "password"}
              value={password} onChange={e => setPassword(e.target.value)}
              icon={Lock} placeholder="••••••••"
              rightIcon={showPassword ? EyeOff : Eye}
              onRightIconClick={() => setShowPassword(!showPassword)}
            />

            <button
              type="submit"
              disabled={submitting}
              className={`w-full flex justify-center py-3.5 px-4 rounded-xl shadow-lg shadow-primary/20 text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 transform hover:-translate-y-0.5 ${submitting ? 'opacity-70 cursor-not-allowed hover:bg-primary/80 hover:translate-y-0' : ''}`}
            >
              {submitting ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="animate-spin h-4 w-4" />
                  <span>Signing in...</span>
                </div>
              ) : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const InputField = ({ id, label, type, value, onChange, icon: Icon, placeholder, rightIcon: RightIcon, onRightIconClick }) => (
  <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Icon className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
      </div>
      <input
        id={id}
        name={id}
        type={type}
        required
        value={value}
        onChange={onChange}
        className={`block w-full pl-10 ${RightIcon ? 'pr-10' : 'pr-3'} py-3 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm bg-slate-50/50 focus:bg-white`}
        placeholder={placeholder}
      />
      {RightIcon && (
        <button
          type="button"
          onClick={onRightIconClick}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
        >
          <RightIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  </div>
);

export default Login;
