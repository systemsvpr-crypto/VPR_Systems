import { createClient } from '@supabase/supabase-api-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    const { data, error } = await supabase.from('products').select('*').limit(1);
    console.log('Products:', { data, error });

    const { data: vData, error: vError } = await supabase.from('master_vendors').select('*').limit(1);
    console.log('Master Vendors:', { data: vData, error: vError });
}

checkTables();
