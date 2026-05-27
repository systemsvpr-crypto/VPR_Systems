import { supabase } from '../supabase';

export const profileService = {
    async getByIdentifier(identifier, isUserId = true) {
        let query = supabase.from('users').select('*');
        if (isUserId) {
            query = query.eq('user_id', identifier);
        } else {
            query = query.eq('username', identifier);
        }
        const { data, error } = await query.limit(1);
        if (error) throw error;
        return data && data.length > 0 ? data[0] : null;
    },

    async update(userId, userData) {
        const { error } = await supabase
            .from('users')
            .update(userData)
            .eq('user_id', userId);
        if (error) throw error;
        return true;
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

    async updateProfilePicture(userId, publicUrl) {
        const { error } = await supabase
            .from('users')
            .update({ profile_picture: publicUrl })
            .eq('user_id', userId);
        if (error) throw error;
        return true;
    },
};
