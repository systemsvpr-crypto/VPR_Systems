import React, { useEffect, useState } from 'react';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  Edit2,
  Save,
  Camera,
  Shield,
  Eye,
  EyeOff,
  Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../supabase';
import useAuthStore from '../store/authStore';
import { USER_ROLES, GENDERS } from '../constants';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

const MyProfile = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) throw new Error("User session not found.");

      const sessionUser = JSON.parse(storedUser);
      const identifier = sessionUser.user_id || sessionUser.username;

      if (!identifier) throw new Error("User identifier missing.");

      let query = supabase.from('users').select('*');
      if (sessionUser.user_id) {
        query = query.eq('user_id', sessionUser.user_id);
      } else {
        query = query.eq('username', sessionUser.username);
      }

      const { data, error } = await query.limit(1);
      if (error) {
         throw error;
      }
      const userData = data && data.length > 0 ? data[0] : null;
      if (!userData) {
        // User not found in 'users', maybe they are an old 'app_users' user.
        // Let's clear their session and ask them to login again
        useAuthStore.getState().logout();
        localStorage.removeItem('user');
        toast.error("Session expired or user not found. Please log in again.");
        window.location.href = '/login';
        return;
      }

      setProfileData(userData);
      setFormData({ ...userData, password: userData.password || '' });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      toast.error(`Failed to load profile: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === 'phone_number') {
      newValue = value.replace(/[^0-9]/g, '').slice(0, 10);
    }

    setFormData(prev => ({ ...prev, [name]: newValue }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `profile-pictures/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('images')
        .getPublicUrl(fileName);

      const publicUrl = data.publicUrl;
      setFormData(prev => ({ ...prev, profile_picture: publicUrl }));

      // Auto-save if not editing
      if (!isEditing && profileData) {
        await supabase.from('users').update({ profile_picture: publicUrl }).eq('user_id', profileData.user_id);
        setProfileData(prev => ({ ...prev, profile_picture: publicUrl }));
        
        // Sync with store and localStorage
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          const updatedUser = { ...currentUser, profile_picture: publicUrl };
          useAuthStore.getState().login(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
        toast.success('Profile picture updated');
      }

    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Error uploading image: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (formData.username && /\s/.test(formData.username.trim())) {
      return toast.error('Username cannot contain spaces');
    }
    if (formData.phone_number && formData.phone_number.length !== 10) {
      return toast.error('Phone number must be exactly 10 digits');
    }
    if (!formData.full_name?.trim()) return toast.error('Full Name is required');

    try {
      setLoading(true);
      // Exclude non-updatable fields
      const { created_at, updated_at, user_id, password, ...updates } = formData;

      const cleanUpdates = {
        ...updates,
        username: updates.username?.trim(),
        full_name: updates.full_name?.trim(),
        email: updates.email?.trim(),
        date_of_birth: updates.date_of_birth || null
      };

      if (password && password.trim() !== '') {
        cleanUpdates.password = password;
      }

      const { error } = await supabase
        .from('users')
        .update(cleanUpdates)
        .eq('user_id', profileData.user_id);

      if (error) throw error;

      setProfileData({ ...formData, password: '' });
      setFormData(prev => ({ ...prev, password: '' }));
      setIsEditing(false);

      // Sync with store and localStorage
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        const updatedUser = {
          ...currentUser,
          ...cleanUpdates,
          Name: cleanUpdates.full_name || currentUser.Name,
          Admin: (cleanUpdates.role?.toUpperCase() === 'ADMIN' || cleanUpdates.role?.toUpperCase() === 'SUPER ADMIN') ? 'Yes' : 'No'
        };
        useAuthStore.getState().login(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

      toast.success("Profile updated successfully!");

    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !profileData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            My <span className="text-primary">Profile</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">Manage your professional identity and security settings.</p>
        </div>
        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setFormData({ ...profileData, password: '' });
                }}
                className="px-6 py-2.5 h-auto text-slate-600 bg-white border-slate-200 rounded-xl hover:bg-slate-50 font-bold transition-all"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="gap-2 px-6 py-2.5 h-auto bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 shadow-md shadow-primary/20 font-bold transition-all"
              >
                <Save size={18} />
                <span>Save Changes</span>
              </Button>
            </>
          ) : (
            <Button
              onClick={() => setIsEditing(true)}
              className="gap-2 px-6 py-2.5 h-auto bg-white text-primary border border-primary/20 rounded-xl hover:bg-primary/5 shadow-sm font-bold transition-all"
            >
              <Edit2 size={18} />
              <span>Edit Profile</span>
            </Button>
          )}
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Profile Card */}
            <div className="lg:col-span-4 space-y-8">
              <div className="erp-card group overflow-hidden border-none shadow-xl shadow-slate-200/40 p-0">
                <div className="relative h-32 bg-slate-900 overflow-hidden">
                  <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-transparent"></div>
                </div>
                <div className="px-8 pb-8 relative">
                  <div className="relative -mt-16 mb-6 inline-block">
                    <div className="w-32 h-32 rounded-3xl border-4 border-white overflow-hidden bg-white shadow-2xl flex items-center justify-center transform group-hover:scale-[1.02] transition-transform duration-500">
                      {formData.profile_picture ? (
                        <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                          <User size={64} className="text-slate-200" />
                        </div>
                      )}
                    </div>
                    {isEditing && (
                      <label className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground p-3 rounded-2xl cursor-pointer hover:bg-slate-900 transition-all shadow-xl border-4 border-white active:scale-95">
                        {uploading ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Camera size={18} />
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                      </label>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">{formData.full_name || 'User'}</h2>
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg w-fit">
                        <Briefcase size={14} className="text-primary" />
                        <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">{formData.designation || 'No Designation'}</span>
                      </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Status</span>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${formData.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${formData.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                          {formData.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <ProfileStat label="System Role" value={formData.role || 'Employee'} uppercase />
                      <ProfileStat label="Member Since" value={formData.created_at ? new Date(formData.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '-'} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Details */}
            <div className="lg:col-span-8 space-y-8">
              <SectionCard title="Personal Information" icon={User}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <InfoField label="Full Name" name="full_name" value={formData.full_name} onChange={handleInputChange} icon={User} isEditing={isEditing} required />
                  <InfoField label="Designation" name="designation" value={formData.designation} onChange={handleInputChange} icon={Briefcase} isEditing={isEditing} />
                  <InfoField label="Username" value={formData.username} icon={Shield} disabled />
                  
                  {isEditing ? (
                    <InfoField
                      label="New Password" name="password" type="password"
                      value={formData.password} onChange={handleInputChange}
                      icon={Lock} isEditing={isEditing} placeholder="Leave blank to keep current"
                    />
                  ) : (
                    <InfoField label="Security" value="Verified Account" icon={Shield} disabled />
                  )}

                  <div className="md:col-span-1">
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Date of Birth</label>
                    {isEditing ? (
                      <DatePicker
                        name="date_of_birth"
                        value={formData.date_of_birth}
                        onChange={handleInputChange}
                      />
                    ) : (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 group hover:bg-white hover:shadow-sm transition-all duration-300">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className={`text-sm font-bold ${!formData.date_of_birth ? 'text-slate-400 italic' : 'text-slate-800'}`}>
                          {formData.date_of_birth ? new Date(formData.date_of_birth).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Not specified'}
                        </span>
                      </div>
                    )}
                  </div>
                  <InfoField label="Gender" name="gender" type="select" options={GENDERS} value={formData.gender} onChange={handleInputChange} icon={User} isEditing={isEditing} />
                </div>
              </SectionCard>

              <SectionCard title="Contact Information" icon={Phone}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <InfoField label="Email Address" name="email" value={formData.email} onChange={handleInputChange} icon={Mail} isEditing={isEditing} />
                  <InfoField
                    label="Phone Number" name="phone_number" value={formData.phone_number}
                    onChange={handleInputChange} icon={Phone} isEditing={isEditing}
                    placeholder="10 digit number"
                  />
                  <div className="md:col-span-2">
                    <InfoField label="Current Address" name="current_address" type="textarea" value={formData.current_address} onChange={handleInputChange} icon={MapPin} isEditing={isEditing} />
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-components
const ProfileStat = ({ label, value, uppercase }) => (
  <div className="flex items-center justify-between">
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    <span className={`text-xs font-bold text-slate-800 ${uppercase ? 'uppercase tracking-wide text-primary' : ''}`}>
      {value}
    </span>
  </div>
);

const SectionCard = ({ title, icon: Icon, children }) => (
  <div className="erp-card p-0 overflow-hidden">
    <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-xl text-primary">
          <Icon size={18} strokeWidth={2.5} />
        </div>
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{title}</h3>
      </div>
    </div>
    <div className="p-8">{children}</div>
  </div>
);

const InfoField = ({
  label, icon: Icon, name, value, onChange,
  type = "text", required = false, disabled = false,
  isEditing = true, options = null, placeholder = null
}) => {
  const [showPassword, setShowPassword] = useState(false);

  // Read Only View
  if (!isEditing || disabled) {
    let displayValue = value;
    if (type === 'date' && value) displayValue = new Date(value).toLocaleDateString('en-GB');
    if (type === 'password') displayValue = '••••••••';

    return (
      <div className="group">
        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</label>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 group-hover:bg-white group-hover:shadow-sm group-hover:border-primary/20 transition-all duration-300">
          <Icon className="h-4 w-4 text-primary flex-shrink-0" />
          <span className={`text-sm font-bold ${!value ? 'text-slate-400 italic' : 'text-slate-800'}`}>
            {displayValue || 'Not provided'}
          </span>
        </div>
      </div>
    );
  }

  // Edit Mode
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-primary">
          <Icon size={16} className="text-slate-400" />
        </div>

        {type === 'select' ? (
          <Select
            name={name}
            value={value || ''}
            onValueChange={(val) => onChange({ target: { name, value: val } })}
          >
            <SelectTrigger className="w-full pl-11 h-12 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all">
              <SelectValue placeholder={placeholder || `Select ${label}`} />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 shadow-xl">
              <SelectGroup>
                <SelectLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 py-2">{label}</SelectLabel>
                {options?.map(opt => (
                  <SelectItem key={opt} value={opt} className="rounded-lg mx-1 focus:bg-primary/5 focus:text-primary font-bold">
                    {opt}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : type === 'textarea' ? (
          <Textarea
            name={name}
            value={value || ''}
            onChange={onChange}
            className="w-full pl-11 py-3.5 min-h-[120px] rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all resize-none font-bold text-sm"
            placeholder={placeholder || `Enter your ${label.toLowerCase()}...`}
          />
        ) : (
          <>
            <Input
              type={type === 'password' ? (showPassword ? 'text' : 'password') : type}
              name={name}
              value={value || ''}
              onChange={onChange}
              className="w-full pl-11 pr-12 h-12 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all font-bold text-sm"
              placeholder={placeholder || `Enter ${label.toLowerCase()}`}
            />
            {type === 'password' && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MyProfile;
