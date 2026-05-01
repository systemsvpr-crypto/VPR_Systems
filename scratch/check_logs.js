
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkLogs() {
    const { data, error } = await supabase
        .from('whatsapp_logs')
        .select('message_type, status, error_message, created_at')
        .eq('status', 'Success')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Recent Successful Messages:');
    console.table(data);
}

checkLogs();
