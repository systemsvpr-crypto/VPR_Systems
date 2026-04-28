import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function synchronizeStock() {
    console.log('Starting stock synchronization...');

    // 1. Fetch all products
    let allProducts = [];
    let page = 0;
    while (true) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allProducts = allProducts.concat(data);
        page++;
    }

    console.log(`Fetched ${allProducts.length} products.`);

    // 2. Fetch all stock_management entries
    let allTxns = [];
    page = 0;
    while (true) {
        const { data, error } = await supabase
            .from('stock_management')
            .select('transaction_type, quantity, godown_id, from_location, product_id, entry_id')
            .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allTxns = allTxns.concat(data);
        page++;
    }

    console.log(`Fetched ${allTxns.length} stock management transactions.`);

    let updateCount = 0;

    for (const product of allProducts) {
        const targetGodown = product.godown_id;
        const txns = allTxns.filter(t => t.product_id === product.product_id);
        
        let in_stock = 0;
        let out_stock = 0;

        txns.forEach(t => {
            if (t.godown_id === targetGodown && t.transaction_type === 'in') {
                in_stock += parseFloat(t.quantity) || 0;
            }
            if (t.godown_id === targetGodown && t.transaction_type === 'out') {
                out_stock += parseFloat(t.quantity) || 0;
            }
            if (t.from_location === targetGodown) {
                out_stock += parseFloat(t.quantity) || 0;
            }
        });

        const opening = parseFloat(product.opening_quantity) || 0;
        const mux = parseFloat(product.mux) || 0;
        const expectedClosing = opening + in_stock - out_stock;
        const expectedQuantity = (expectedClosing * mux).toFixed(3);

        const currentClosing = parseFloat(product.closing_quantity) || 0;
        const currentQuantity = parseFloat(product.quantity) || 0;

        // If mismatched, update product
        if (Math.abs(expectedClosing - currentClosing) > 0.001 || Math.abs(parseFloat(expectedQuantity) - currentQuantity) > 0.001) {
            console.log(`Mismatch found for ${product.name} (ID: ${product.product_id}). Expected Closing: ${expectedClosing}, Current: ${currentClosing}. Fixing...`);
            
            const { error } = await supabase
                .from('products')
                .update({ 
                    closing_quantity: expectedClosing,
                    quantity: parseFloat(expectedQuantity)
                })
                .eq('product_id', product.product_id);
            
            if (error) {
                console.error(`Failed to update ${product.product_id}:`, error);
            } else {
                updateCount++;
            }
        }
    }

    console.log(`\nSynchronization complete. Fixed ${updateCount} products.`);
}

synchronizeStock().catch(console.error);
