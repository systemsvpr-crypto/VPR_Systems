import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Read VITE environment variables from local .env
let envUrl = '';
let envKey = '';
try {
    const envFile = fs.readFileSync('c:/Users/pc/Desktop/botivate/vps_Systems/VPR_Systems/.env', 'utf8');
    const urlMatch = envFile.match(/VITE_SUPABASE_URL\s*=\s*(.*)/);
    const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/);
    if (urlMatch) envUrl = urlMatch[1].trim().replace(/['"]/g, '');
    if (keyMatch) envKey = keyMatch[1].trim().replace(/['"]/g, '');
} catch (e) {
    console.error('Error reading env file:', e);
}

const supabase = createClient(envUrl, envKey);

async function run() {
    console.log('--- PRODUCTS TABLE SAMPLE ---');
    const { data: prods, error: err1 } = await supabase.from('products').select('*').limit(3);
    console.log('Products:', JSON.stringify(prods, null, 2), err1);

    console.log('--- DAILY STOCK SUMMARY SAMPLE ---');
    const { data: sums, error: err2 } = await supabase.from('daily_stock_summary').select('*').limit(3);
    console.log('Daily Summary:', JSON.stringify(sums, null, 2), err2);
    
    console.log('--- PRODUCTS COUNT WITH SKU PROD-0019 ---');
    const { data: prodSearch, error: err3 } = await supabase.from('products').select('*').eq('product_id', 'PROD-0019');
    console.log('PROD-0019 in products:', JSON.stringify(prodSearch, null, 2), err3);
}

run();
