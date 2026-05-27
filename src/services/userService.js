import { supabase } from '../supabase';

export const userService = {
    async getAll() {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async create(userData) {
        const { error } = await supabase
            .from('users')
            .insert([userData]);
        if (error) throw error;
        return true;
    },

    async update(userId, userData) {
        const { error } = await supabase
            .from('users')
            .update(userData)
            .eq('user_id', userId);
        if (error) throw error;
        return true;
    },

    async checkDuplicate(field, value, excludeUserId = null) {
        let query = supabase.from('users').select('user_id').eq(field, value);
        const { data, error } = await query;
        if (error) throw error;
        if (excludeUserId) {
            return (data || []).filter(u => u.user_id !== excludeUserId);
        }
        return data || [];
    },

    async uploadProfilePicture(file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `profile-pictures/${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(fileName, file);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage
            .from('images')
            .getPublicUrl(fileName);

        return data.publicUrl;
    },
};
