import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://ldbrkqhkecgdpmozegoa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYnJrcWhrZWNnZHBtb3plZ29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3OTU1NDUsImV4cCI6MjA5MTM3MTU0NX0.XAhg3_hPNE84AJHWqyvsjEW5IZ0p2KXo5hOm52Aj25Q';
const TARGET_DATE = process.argv[2] || new Date().toISOString().split('T')[0];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log(`\n📅 Generating daily stock summary for: ${TARGET_DATE}\n`);

  // Step 1: Call the RPC function
  console.log('⏳ Calling generate_daily_summary...');
  const { error: rpcErr } = await supabase.rpc('generate_daily_summary', {
    target_date: TARGET_DATE,
  });

  if (rpcErr) {
    console.error('❌ RPC Error:', rpcErr.message);
    console.log('\n💡 Make sure you have run the migration SQL first via Supabase SQL Editor.');
    process.exit(1);
  }
  console.log('✅ Function executed successfully!\n');

  // Step 2: Fetch and display results
  const { data: summary, error: fetchErr } = await supabase
    .from('daily_stock_summary')
    .select('*')
    .eq('date', TARGET_DATE)
    .order('godown_id')
    .order('product_id');

  if (fetchErr) {
    console.error('❌ Error fetching results:', fetchErr.message);
    process.exit(1);
  }

  if (!summary || summary.length === 0) {
    console.log('⚠️  No summary rows generated. Either no products exist or no activity on this date.\n');
    return;
  }

  console.log(`📊 Generated ${summary.length} summary rows:\n`);
  console.log('┌──────────┬──────────────┬──────────────────────────┬────────┬──────┬───────┬────────┐');
  console.log('│ Godown   │ Product ID   │ Opening │ In │ Out │ Closing │');
  console.log('├──────────┼──────────────┼─────────┼─────┼──────┼─────────┤');

  // Get godown names for display
  const { data: godowns } = await supabase.from('godowns').select('godown_id, name');
  const godownMap = {};
  if (godowns) godowns.forEach(g => { godownMap[g.godown_id] = g.name; });

  for (const row of summary) {
    const gName = (godownMap[row.godown_id] || row.godown_id).padEnd(10).slice(0, 10);
    const pId = row.product_id.padEnd(14).slice(0, 14);
    const oS = String(row.opening_stock).padStart(7);
    const iS = String(row.in_stock).padStart(5);
    const oS2 = String(row.out_stock).padStart(6);
    const cS = String(row.closing_stock).padStart(7);
    console.log(`│ ${gName}│ ${pId}│ ${oS} │ ${iS} │ ${oS2} │ ${cS} │`);
  }

  console.log('└──────────┴──────────────┴─────────┴─────┴──────┴─────────┘\n');

  // Step 3: Verify closing = opening + in - out
  let allValid = true;
  for (const row of summary) {
    const expected = Number(row.opening_stock) + Number(row.in_stock) - Number(row.out_stock);
    const actual = Number(row.closing_stock);
    const match = Math.abs(expected - actual) < 0.001;
    if (!match) {
      console.log(`❌ MISMATCH: ${row.product_id} in ${row.godown_id}: expected closing ${expected}, got ${actual}`);
      allValid = false;
    }
  }
  if (allValid) console.log('✅ All closing stock values verified (closing = opening + in - out)\n');

  // Step 4: Check if previous day exists for opening match verification
  const prevDate = new Date(TARGET_DATE);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const { data: prevSummary } = await supabase
    .from('daily_stock_summary')
    .select('*')
    .eq('date', prevDateStr);

  if (prevSummary && prevSummary.length > 0) {
    console.log(`🔗 Cross-day verification (${TARGET_DATE} opening vs ${prevDateStr} closing):\n`);
    let allMatch = true;
    for (const row of summary) {
      const prev = prevSummary.find(
        p => p.product_id === row.product_id && p.godown_id === row.godown_id
      );
      if (prev) {
        const match = Math.abs(Number(row.opening_stock) - Number(prev.closing_stock)) < 0.001;
        if (!match) {
          console.log(`  ❌ ${row.product_id} in ${row.godown_id}: opening=${row.opening_stock}, prev closing=${prev.closing_stock}`);
          allMatch = false;
        }
      }
    }
    if (allMatch) console.log('✅ All opening stocks match previous day\'s closing stocks ✓');
  } else {
    console.log(`ℹ️  No previous day (${prevDateStr}) data for cross-day verification.\n`);
  }

  console.log('🎉 Done!');
}

run().catch(console.error);
