import { supabase } from '../supabase';

export const notificationService = {
    async getAll() {
        const { data, error } = await supabase
            .from('stock_notifications')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getUnread() {
        const { data, error } = await supabase
            .from('stock_notifications')
            .select('*')
            .eq('is_read', false)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getUnreadCount() {
        const { count, error } = await supabase
            .from('stock_notifications')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false);
        if (error) throw error;
        return count;
    },

    async create(notificationData) {
        const { data, error } = await supabase
            .from('stock_notifications')
            .insert([notificationData])
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async markAsRead(id) {
        const { data, error } = await supabase
            .from('stock_notifications')
            .update({ is_read: true })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async markAllAsRead() {
        const { data, error } = await supabase
            .from('stock_notifications')
            .update({ is_read: true })
            .eq('is_read', false)
            .select();
        if (error) throw error;
        return data;
    },

    async delete(id) {
        const { error } = await supabase
            .from('stock_notifications')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    },

    async getByType(notificationType) {
        const { data, error } = await supabase
            .from('stock_notifications')
            .select('*')
            .eq('notification_type', notificationType)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    subscribeToNotifications(callback) {
        const channel = supabase
            .channel('stock-notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'stock_notifications',
                },
                (payload) => callback(payload.new)
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    },
};