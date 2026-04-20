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

      const { data, error } = await query.single();
      if (error) throw error;
      if (!data) throw new Error("User profile not found.");

      setProfileData(data);
      setFormData({ ...data, password: data.password || '' });
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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Profile</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage your personal information and view history.</p>
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
                className="px-4 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="gap-2 px-5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm font-medium"
              >
                <Save size={18} />
                <span>Save Changes</span>
              </Button>
            </>
          ) : (
            <Button
              onClick={() => setIsEditing(true)}
              variant="outline"
              className="gap-2 px-5 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm font-medium"
            >
              <Edit2 size={18} />
              <span>Edit Profile</span>
            </Button>
          )}
        </div>
      </div>

      <div className="">
        <div className="max-w-7xl mx-auto space-y-6 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Profile Card */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="relative h-32 bg-gradient-to-r from-slate-100 to-slate-200">
                  <div className="absolute inset-0 bg-slate-50/50"></div>
                </div>
                <div className="px-6 pb-6 relative">
                  <div className="relative -mt-16 mb-4 inline-block group">
                    <div className="w-32 h-32 rounded-full border-4 border-white overflow-hidden bg-white shadow-md flex items-center justify-center">
                      {formData.profile_picture ? (
                        <img src={formData.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User size={64} className="text-slate-300" />
                      )}
                    </div>
                    {isEditing && (
                      <label className="absolute bottom-1 right-1 bg-primary text-primary-foreground p-2.5 rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-lg border-2 border-white">
                        {uploading ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Camera size={16} />
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                      </label>
                    )}
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">{formData.full_name || 'User'}</h2>
                    <div className="flex flex-col gap-1 mt-1">
                      <p className="text-slate-500 font-medium flex items-center gap-2">
                        <Briefcase size={16} className="text-primary" />
                        <span>{formData.designation || 'No Designation'}</span>
                      </p>
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Status</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${formData.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {formData.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <ProfileStat label="Role" value={formData.role || 'Employee'} uppercase />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Details */}
            <div className="lg:col-span-8 space-y-6">
              <SectionCard title="Personal Information" icon={User}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InfoField label="Full Name" name="full_name" value={formData.full_name} onChange={handleInputChange} icon={User} isEditing={isEditing} required />
                  <InfoField label="Designation" name="designation" value={formData.designation} onChange={handleInputChange} icon={Briefcase} isEditing={isEditing} />
                  <InfoField label="Username" value={formData.username} icon={User} disabled />
                  {isEditing && (
                    <InfoField
                      label="Password" name="password" type="password"
                      value={formData.password} onChange={handleInputChange}
                      icon={Lock} isEditing={isEditing} placeholder="Enter to change password"
                    />
                  )}
                  <div className="md:col-span-1">
                    {isEditing ? (
                      <>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Birth</label>
                        <DatePicker
                          name="date_of_birth"
                          value={formData.date_of_birth}
                          onChange={handleInputChange}
                        />
                      </>
                    ) : (
                      <div className="group">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of Birth</label>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 group-hover:border-slate-300 transition-colors">
                          <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <span className={`text-sm font-medium ${!formData.date_of_birth ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                            {formData.date_of_birth ? new Date(formData.date_of_birth).toLocaleDateString('en-GB') : 'Not set'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <InfoField label="Gender" name="gender" type="select" options={GENDERS} value={formData.gender} onChange={handleInputChange} icon={User} isEditing={isEditing} />
                </div>
              </SectionCard>

              <SectionCard title="Contact Information" icon={Phone}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-500">{label}</span>
    <span className={`font-semibold text-slate-800 ${uppercase ? 'uppercase' : ''}`}>
      {value}
    </span>
  </div>
);

const SectionCard = ({ title, icon: Icon, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50/50">
      <div className="bg-primary/10 p-2 rounded-lg">
        <Icon className="text-primary" size={20} />
      </div>
      <h3 className="font-bold text-slate-900">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
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
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 group-hover:border-slate-300 transition-colors">
          <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className={`text-sm font-medium ${!value ? 'text-slate-400 italic' : 'text-slate-700'}`}>
            {displayValue || 'Not set'}
          </span>
        </div>
      </div>
    );
  }

  // Edit Mode
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="h-4 w-4 text-slate-400" />
        </div>

        {type === 'select' ? (
          <Select
            name={name}
            value={value || ''}
            onValueChange={(val) => onChange({ target: { name, value: val } })}
          >
            <SelectTrigger className="w-full pl-10 h-10">
              <SelectValue placeholder={placeholder || `Select ${label}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{label}</SelectLabel>
                {options?.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : type === 'textarea' ? (
          <Textarea
            name={name}
            value={value || ''}
            onChange={onChange}
            className="w-full pl-10 py-2.5 min-h-[100px]"
            placeholder={placeholder || `Enter ${label}`}
          />
        ) : (
          <>
            <Input
              type={type === 'password' ? (showPassword ? 'text' : 'password') : type}
              name={name}
              value={value || ''}
              onChange={(e) => {
                if (type === 'password' && !showPassword) setShowPassword(true);
                onChange(e);
              }}
              className="w-full pl-10 pr-10 h-10"
              placeholder={placeholder || `Enter ${label}`}
            />
            {type === 'password' && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MyProfile;
