I need to add a "Stock Ledger" tab to my existing React + Tailwind + Supabase stock management app. Below is everything you need — database schema, PDF layout analysis, data logic, and UI requirements.

---

## 1. DATABASE SCHEMA (Supabase)

CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  product_id text UNIQUE NOT NULL,
  name text NOT NULL,
  godown_id text REFERENCES godowns(godown_id),
  godown_name text,
  quantity numeric DEFAULT 0,
  opening_quantity numeric DEFAULT 0,
  closing_quantity numeric DEFAULT 0,
  product_type text,
  master_product_id uuid REFERENCES master_product(id),
  unit text,
  is_active boolean DEFAULT true
);

CREATE TABLE public.daily_stock_summary (
  id uuid PRIMARY KEY,
  date date NOT NULL DEFAULT CURRENT_DATE,
  godown_id text NOT NULL,
  product_id text NOT NULL,
  opening_stock numeric DEFAULT 0,
  in_stock numeric DEFAULT 0,
  out_stock numeric DEFAULT 0,
  closing_stock numeric DEFAULT 0
);

CREATE TABLE public.godowns (
  id uuid PRIMARY KEY,
  godown_id text UNIQUE NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true
);

CREATE TABLE public.stock_management (
  id uuid PRIMARY KEY,
  entry_id text UNIQUE NOT NULL,
  godown_id text NOT NULL,
  product_id text NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('in','out','adjustment')),
  quantity numeric NOT NULL,
  opening_stock numeric,
  closing_stock numeric,
  date date NOT NULL DEFAULT CURRENT_DATE,
  reference_number text,
  notes text
);

CREATE TABLE public.master_product (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  is_active boolean DEFAULT true
);

---

## 2. WHAT THE PDF LOOKS LIKE (Full Layout Analysis)

The PDF is a daily stock ledger exported from Google Sheets. It has the following structure:

### PAGE 1 — TOP SUMMARY BAR
A single summary row showing godown-wise stock movement for the selected date:

| Godown | Opening | Inward | Outward | Closing |
|--------|---------|--------|---------|---------|
| GDN    | 5858    | 61     | 252     | 5667    |
| Sheet  | 2032    | 0      | 50      | 1982    |

Plus standalone closing quantities for sub-godowns:
- LP: 1448
- DP: 231
- Dusera: 672
- Darba: 39

Also shows: Date (01/05/2026), Day (Friday), Made By, Check By fields, and a "Godown Match" indicator.

---

### PAGE 2 — MAIN PRODUCT TABLE (GDN Godown)

This is the largest section. It is a wide grid organized as follows:

**ROW AXIS = Size variants** (e.g., 8X10, 10X13, 13X16, 16X20, 11X14, etc.)
**COLUMN AXIS = Product SKUs grouped into brand/category groups**

Each cell = quantity (bags) of that product in that size. Empty = 0 (show blank).
Last row = TOTAL per product column.

**Column Groups and their SKUs (in order, left to right):**

GROUP 1 — KIRANA:
LOTUS LD | KIRANA LD Plane | CHINA | ZOOM NT | KING NT | Kiwi Nt | Kiwi Clr | Apple Clr | China Shyam Blk | China AM BLK | Spiderman Nt | China Gulab Nt | New Light Pink | Natraj NT | Natureplus
Sizes: 6X7, 4X8, 6X9, 5X10, 8X11, 6X12, 9X13, 7X14, 10X15, 8X16, 13X19, 9X18, 16X21, 11X22

GROUP 2 — PICUP / BAG / CLR brands:
SHYAM CLR | ZOOM CLR | KING 1ST CLR | GANESH CLR | G20 CLR | Rajdhani Gold Clr | IDEA BLACK | CHINA RK GOLD BLK | Mayur China | GANESH BLK | Kohinoor China | Clr Gulab Clr | Raja Clr China | Crown Clr China
Sizes: 4X8, 5X10, 6X12, 7X14, 8X16, 9X18, 11X22

GROUP 3 — NT 200G:
SHIVA NT 200g | ONE PLUS NT 200g | SKY NT 200g | RELAX NT 200G | BLUE TONE NT 200G | SHANTI NT 200G | DISNEY NT 200 | Suraj NT 200 | Apple Diamond | Krishna Nt 200 | Little Hearts 1kg | LDNT China 11*22 | Samrat ld 180g | Bhola ld blk 200
Sizes: 8X10, 10X13, 13X16, 16X20

GROUP 4 — NT 160G:
Chirag nt 160g | Star Magic Nt 160 | HONEY NT 160 | 100 no nt 160 | AMBUJA NT 160 | BULLDOG NT 160 | PUSHP NT160 | ROYAL NT 160 | Krishna semi nt 160 | Gautam Nt 160 | Star Gold 160 | Google NT 160 | Utsav NT 160
Sizes: 8X10, 10X13, 13X16, 16X20, 11X14

GROUP 5 — NT 140/150 (Mixed):
No1 NT 140 | G20 NT160 | KISAN NT 150 | Prime Apple Nt 150 | Honda Nt 140 | Nandi NT 140 | Volvo Nt 140 | Apple nt 140 | Gautam Nt 140 | HR NT 180 | HIGHWAY Blk 200 | Marlex FC 180 | Aadesh Blk 180 | YOUTUBE BLK 150
Sizes: 8X10, 10X13, 13X16, 16X20, 11X14

GROUP 6 — BLK 200G:
MAMA BLk 200 | SMILE BLK 200 | ONE PLUS BLK 200 | PARLE BLK 200 | KISAN BLk 200 | YOUTUBE BLK 200 | Mama 2 Blk 200g | Marlex Blk 200g | Youtube Blk 180 | GALAXY BLK 200 | GALAXY BLK 180 | TanMan Blk 150g | Fortuner LD Blk 200 | Super Dhamal Clr
Sizes: 8X10, 10X13, 13X16, 16X20

GROUP 7 — CLR / FC:
Sunday clr 200 | Star magic 200 | G20 LDFC 200 | Delux Fc 180g | BHOLE LD clr 180 | TAJ CLR | Sky FC200 | Gems LD Clr 180 | Neelkamal LD Clr | OK FC | Utsav fcpkt | Mayur FC | Jai Pack Clr | Star Gold Clr 100 | Suraj LD Clr
Sizes: 8X10, 10X13, 13X16, 16X20

---

### PAGE 3 — SHEET GODOWN TABLE

A separate product grid for the "Sheet" godown with its own product groups:

GROUP A — CHUTNEY / POLY PLUS / DCUT:
CHUTNEY POLY PLUS 200g | DCUT STAR | KAKA | KAKA STAR | Chutney nt 1Kg | Dabang 4"
Size rows: 4X5, 4X6, 5X6, 5X7, 8X10, 5X6 500g, RETURN

GROUP B — LOCK BAG:
56 MIC | 51 MIC | MILKY
Size rows: 2X3, 2.5X3.5, 3X4, 4X4, 4X5, 4X6, 5X6, 5X7, 6X8, 7X10, 8X10, 10X13

GROUP C — BIO / ECO BAGS:
BIOSA | Yatra Bio | Milky | KOHINOOR | Thank U | Paytm | SUN CHAKRI | KANHA CHAKRI | CUTTING 100 | Fighter Jet Mini | CUTTING 1ST | SUNRISE MINI | GALAXY MINI | Cutting Top | Sawan Poncho | Aditya 7mm

GROUP D — PP WOVEN:
UL | UI | Polyking | Cutting
Size rows: 19X33, 24X44

GROUP E — LD / DAIRY / KIRANA FILMS:
KAKA LD | DAIRY LD | Kirana BLUE | YATRA | SUPERFRESH | LDBLK 13*16
Size rows: 4X6, 5X7, 5X9, 6X8, 6X9, 8X10, 8X11, 10X12, 10X13

GROUP F — SARTHI / HIGHWAY / G20 / H20:
Sarthi Nt 150g | Highway Nt 160g | Highway Nt 200g | G20 NT 180G | H20 NT 200 | Sarthi NT 200 | Sarthi LDFC 160 | Sarthi Clr 140 | Sarthi NT 160 | No 1 FC 180 | Highway Clr 160 | Swastic Nt 140 | HIGHWAY 180G | SARTHI NT nv 150 | Darba No.1 NT 140g | Highway NT 160 | G20 NT 200 | Sarthi NT 200
Sizes: 8X10, 10X13, 13X16, 16X20

GROUP G — GARBAGE / DARK / TAMATAR:
Garbage Blk | TAMATAR | TAR DARK
Sizes: 8X10, 10X13, 13X16, 16X20

GROUP H — SARAS / NEW LIGHT / ANAND:
Saras nt 200 | New light Blk 8x10 | Anand ld clr 8x10

GROUP I — MISC SHEET SIZES:
Various sizes: 4X8, 5X10, 6X12, 7X14, 8X16, 9X18, 11X22, 8X8, 8X9, 8X10, 9X12, 19X21, 30X40, 36X44, 30X50

---

### PAGE 4 — SHEET STOCK DETAIL (NT/BLK/CLR breakdown)

Shows the Sheet godown stock broken down by:
- NT total | Blk total | Clr total | Extra | Grand Total | Balance
With sheet brand rows:
Sheet NT | Samrat NT | Shiva NT | Rockstar NT | N-1 | NV | Mihir | Silver | BMW | Super Pani | Super Gold Old | Samrat Old | Crustal | Kalash NT | SV Fresh | Kisan Sheet | Shilk Sheet | Modi Gold NT | Badal | NT Sheet UB | Super Fresh | Sheet Blk | Shriji Blk | Sawan Blk | DC | DC Blk | DC Blue | Cable | Kalash Blk | Shakti | Patwari | Vansh | Shree Krishna | Subh Labh | Blk Sheet | Sheet Clr Extra | Green Sawan | Yellow Mausam NT | Blue Super Fresh | LNT

Summary at bottom: Total NT=821, Total Blk=1068, Total Clr=67, Extra=26, Grand Total=1982

---

### PAGE 5 — LP / DP / DUSERA / DARBA DETAIL

This page lists products in a simple detail format per godown:

**LP (1448 bags total):**
- Sarthi Nt 150g 8*10 (30 kg) Nv — 17
- Sarthi Nt 150g 10*13 (30 kg) Nv — 9
- Highway Nt 160g 8*10 (32 kg) — 1
- Highway Nt 200g 10*13 (30 kg) — 24
- Highway Nt 200g 16*20 (30 kg) — 15
- SHIVA NT 200G 10*13 (30 kg) — 37
- SHIVA NT 200G 13*16 (30 kg) — 1
- Samrat Sheet 12*10 — 154
- Shree Ji Blk Sheet 12*3 — 490
- SHREE JI BLK SHEET 12*5 — 67
- shree ji blk Sheet 12*12 — 17
- shree ji blk Sheet 12*16 — 3
- Shreeji Nt Sheet 12*3 — 4
- Cutting 1st (50 kg) — 184
- Kisan Sheet 12*5 — 347
- Poncho (Sawan 120pkt) — 94

**DP (231 bags total):**
- SKY NT 200G 8*10 (30 kg) — 13
- SKY NT 200G 10*13 (30 kg) — 6
- SKY NT 200G 16*20 (30 kg) — 6
- Sarthi Nt 150g 8*10 (30 kg) Nv — 21
- Sarthi Nt 150g 10*13 (30 kg) Nv — 41
- Highway Nt 160g 8*10 (32 kg) — 22
- Highway Nt 160g 10*13 (32 kg) — 5
- Highway Nt 160g 13*16 (32 Kg) — 13
- Highway Nt 200g 13*16 (30 kg) — 7
- Highway Nt 150g 8*10 (30 kg) — 34
- Highway Nt 150g 10*13 (30 kg) — 48
- Highway Nt 150g 13*16 (30 kg) — 26
- Star nt 140gm 16*20 (28 kg) — 8
- Saheb Ld Kirana 6*9 (30 kg) — 97
- Saheb Ld Kirana 10*15 (30 kg) — 33
- (+ more Saheb Ld Kirana sizes)
- Satguru 6*7 — 9, 6*9 — 9, 8*11 — 4
- Gwala 2nd Clr Mora 24*60 — 70
- Sawan Mora Nt 24*60 — 16
- Shiva Filler 5*9 — 1
- Ld 51 Mic various sizes — (listed individually)
- Shree Shyam Filler various sizes — (listed individually)
- SHEET CLR 6*10 — 31
- No.1 NT 140g 10*13 — 20
- Damru Hm Kirana 8*11 — 11

**DUSERA (672 bags total):**
- Dabang 4" (25 Kg) — 55
- Gwala Ld 12*18 (30 kg) — 1
- GWALA LD 6*8 — 14
- Gwala Ld 7*11 (30 kg) — 3
- Gwala Ld 8*11 (30 kg) — 1
- Gwala Ld 8*12 (30 kg) — 2
- Hm Liner 24*40 — 7
- Hm Liner 28*32 — 1
- Ld Liner 18*27 — 7
- Ld Liner 24*40 — 3
- Plane Kirana 10*15 — 5

**DARBA (39 bags total):**
(listed as misc items)

---

## 3. IMPLEMENTATION REQUIREMENTS

### Component Structure
Create these components:
1. `StockLedgerTab.jsx` — main container, date picker, tab layout
2. `LedgerSummaryHeader.jsx` — top summary cards per godown
3. `MainProductTable.jsx` — the GDN godown wide grid (Pages 2)
4. `SheetProductTable.jsx` — the Sheet godown grid (Page 3)
5. `SheetStockDetail.jsx` — NT/BLK/CLR brand breakdown (Page 4)
6. `GodownDetailList.jsx` — LP/DP/Dusera/Darba detail list (Page 5)

### UI Specs
- Date picker at top (default: today), triggers data reload
- Godown filter chips: All | GDN | Sheet | LP | DP | Dusera | Darba
- Summary cards: one per godown showing Opening / Inward / Outward / Closing
- "Godown Match" badge: green ✓ if GDN closing = Sheet + LP + DP + Dusera + Darba, red ✗ if mismatch
- Main table: horizontally scrollable, sticky first column (size label), two-level column headers (group name row + SKU name row)
- Cells: show quantity number; show blank (not "0") for zero values
- Bold TOTAL row at bottom of each table section
- Print button: triggers window.print() with @media print CSS that hides nav and shows full table
- Export to Excel button: uses SheetJS (xlsx) to export the visible table

### Data Fetching Logic
```javascript
// 1. Fetch godown summaries for the selected date
const { data: summaries } = await supabase
  .from('daily_stock_summary')
  .select('*, products(name, product_type, godown_name)')
  .eq('date', selectedDate);

// 2. If no daily_stock_summary rows exist for date, compute from stock_management:
const { data: txns } = await supabase
  .from('stock_management')
  .select('*')
  .eq('date', selectedDate);
// Group by godown_id + product_id, sum in/out

// 3. Fetch all products to build column definitions
const { data: products } = await supabase
  .from('products')
  .select('product_id, name, godown_id, godown_name, product_type')
  .eq('is_active', true);
```

### Product → Column Mapping Strategy
Since product names in the DB may not exactly match PDF column labels, add a `PRODUCT_COLUMN_MAP` config object at the top of `MainProductTable.jsx`:
```javascript
const PRODUCT_COLUMN_MAP = {
  // "db product name (lowercase, trimmed)": "PDF column label"
  "lotus ld": "LOTUS LD",
  "kirana ld plane": "KIRANA LD Plane",
  "shiva nt 200g": "SHIVA NT 200g",
  // etc — add all mappings here
};
```
For unmapped products, fall back to the raw `name` field.

Parse size variants from product names using:
```javascript
const sizeRegex = /(\d+\s*[xX*]\s*\d+)/;
const sizeMatch = productName.match(sizeRegex);
const size = sizeMatch ? sizeMatch[1].toUpperCase().replace(/\s/g,'') : 'OTHER';
```

### Column Group Definition (hardcoded structure)
Define the column groups as a constant array so the table always renders in PDF order regardless of DB sort:
```javascript
const COLUMN_GROUPS = [
  {
    groupName: "KIRANA",
    sizes: ["6X7","4X8","6X9","5X10","8X11","6X12","9X13","7X14","10X15","8X16","13X19","9X18","16X21","11X22"],
    skus: ["LOTUS LD","KIRANA LD Plane","CHINA","ZOOM NT","KING NT","Kiwi Nt","Kiwi Clr","Apple Clr","China Shyam Blk","China AM BLK","Spiderman Nt","China Gulab Nt","New Light Pink","Natraj NT","Natureplus"]
  },
  {
    groupName: "CLR BRANDS",
    sizes: ["4X8","5X10","6X12","7X14","8X16","9X18","11X22"],
    skus: ["SHYAM CLR","ZOOM CLR","KING 1ST CLR","GANESH CLR","G20 CLR","Rajdhani Gold Clr","IDEA BLACK","CHINA RK GOLD BLK","Mayur China","GANESH BLK","Kohinoor China","Clr Gulab Clr","Raja Clr China","Crown Clr China"]
  },
  {
    groupName: "NT 200G",
    sizes: ["8X10","10X13","13X16","16X20"],
    skus: ["SHIVA NT 200g","ONE PLUS NT 200g","SKY NT 200g","RELAX NT 200G","BLUE TONE NT 200G","SHANTI NT 200G","DISNEY NT 200","Suraj NT 200","Apple Diamond","Krishna Nt 200","Little Hearts 1kg","LDNT China 11*22","Samrat ld 180g","Bhola ld blk 200"]
  },
  {
    groupName: "NT 160G",
    sizes: ["8X10","10X13","13X16","16X20","11X14"],
    skus: ["Chirag nt 160g","Star Magic Nt 160","HONEY NT 160","100 no nt 160","AMBUJA NT 160","BULLDOG NT 160","PUSHP NT160","ROYAL NT 160","Krishna semi nt 160","Gautam Nt 160","Star Gold 160","Google NT 160","Utsav NT 160"]
  },
  {
    groupName: "NT 140/150",
    sizes: ["8X10","10X13","13X16","16X20","11X14"],
    skus: ["No1 NT 140","G20 NT160","KISAN NT 150","Prime Apple Nt 150","Honda Nt 140","Nandi NT 140","Volvo Nt 140","Apple nt 140","Gautam Nt 140","HR NT 180","HIGHWAY Blk 200","Marlex FC 180","Aadesh Blk 180","YOUTUBE BLK 150"]
  },
  {
    groupName: "BLK 200G",
    sizes: ["8X10","10X13","13X16","16X20"],
    skus: ["MAMA BLk 200","SMILE BLK 200","ONE PLUS BLK 200","PARLE BLK 200","KISAN BLk 200","YOUTUBE BLK 200","Mama 2 Blk 200g","Marlex Blk 200g","Youtube Blk 180","GALAXY BLK 200","GALAXY BLK 180","TanMan Blk 150g","Fortuner LD Blk 200","Super Dhamal Clr"]
  },
  {
    groupName: "CLR / FC",
    sizes: ["8X10","10X13","13X16","16X20"],
    skus: ["Sunday clr 200","Star magic 200","G20 LDFC 200","Delux Fc 180g","BHOLE LD clr 180","TAJ CLR","Sky FC200","Gems LD Clr 180","Neelkamal LD Clr","OK FC","Utsav fcpkt","Mayur FC","Jai Pack Clr","Star Gold Clr 100","Suraj LD Clr"]
  }
];
```

### Godown Name → ID Mapping
The PDF uses these godown labels. Map them to godown_id values in your DB:
- "GDN" → main warehouse godown
- "Sheet" → sheet products godown  
- "LP" → LP godown
- "DP" → DP godown
- "Dusera" → Dusera godown
- "Darba" → Darba godown

Fetch actual godown_id values from the `godowns` table and match by name (case-insensitive).

### Tech Stack
- React functional components with hooks
- Tailwind CSS for all styling
- Supabase JS client (already available as `supabase` import)
- SheetJS (`xlsx`) for Excel export — already available or install via: `npm install xlsx`
- No new dependencies beyond xlsx

### Styling Notes
- Table header group row: `bg-blue-600 text-white text-xs font-bold`
- Table header SKU row: `bg-blue-100 text-blue-900 text-xs`
- Size label column: `bg-gray-100 font-semibold sticky left-0 z-10`
- Total row: `bg-yellow-50 font-bold border-t-2 border-yellow-400`
- Godown Match green: `bg-green-100 text-green-700 border border-green-400`
- Godown Match red: `bg-red-100 text-red-700 border border-red-400`
- Summary cards: white card with colored left border per godown

### Add the Tab
Find the existing tab navigation component and add:
```jsx
{ key: 'stock-ledger', label: 'Stock Ledger', icon: <ClipboardList size={16} /> }
```
And render `<StockLedgerTab />` when that tab is active.