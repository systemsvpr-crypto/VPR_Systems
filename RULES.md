# Inventory Management System — Rules & Logic

---

## 1. Core Concepts

| Term | Definition |
|---|---|
| **Opening Quantity** | Stock available at the **start** of a given day |
| **Stock In** | Total units **received/added** during the day (purchases, returns, adjustments) |
| **Stock Out** | Total units **dispatched/consumed** during the day (sales, wastage, transfers) |
| **Closing Quantity** | Stock available at the **end** of the day |

---

## 2. The Master Formula

```
Closing Quantity = Opening Quantity + Stock In - Stock Out
```

This formula is the single source of truth for every product, every day.

**Example:**
```
Opening Qty  =  100 units
Stock In     =   40 units
Stock Out    =   25 units
─────────────────────────
Closing Qty  =  115 units  (100 + 40 - 25)
```

---

## 3. Day-Roll Logic (Opening ← Previous Closing)

This is the chain that keeps inventory continuous across days.

```
Day N  → Closing Quantity
              │
              ▼
Day N+1 → Opening Quantity
```

### Rules:

**Rule 3.1 — Daily Roll-over**
At the end of every day (or at the start of the next day), each product's
`Opening Quantity (Day N+1) = Closing Quantity (Day N)`

**Rule 3.2 — First Day Seeding**
On the very first day a product is introduced into the system:
- `Opening Quantity = 0` (or a manually entered initial stock count)
- This seed value must be recorded as a one-time "Initial Stock" entry

**Rule 3.3 — No Gaps Allowed**
If a product has no transactions on a given day, a zero-activity record
must still exist so the chain is unbroken:
```
Opening Qty  =  Previous day's Closing Qty
Stock In     =  0
Stock Out    =  0
Closing Qty  =  Same as Opening Qty
```

**Rule 3.4 — Immutable History**
Once a day is closed/rolled over, its records become **read-only**.
No direct edits are allowed. Any correction must go through an
**Adjustment Entry** on the current day (see Section 6).

---

## 4. Stock In — Rules

Stock In increases the on-hand quantity. Every Stock In event must record:

| Field | Description |
|---|---|
| `date` | The date the stock was received |
| `product_id` | Which product |
| `quantity` | Units added |
| `type` | Category: Purchase / Customer Return / Transfer In / Adjustment+ |
| `reference` | PO number, invoice, or memo |
| `recorded_by` | User who entered the record |
| `timestamp` | Exact time of entry |

**Rule 4.1** Stock In is always a **positive** number. Negative Stock In is not allowed — use Adjustment instead.

**Rule 4.2** Multiple Stock In entries on the same day are **summed**:
```
Total Stock In (Day N) = SUM of all Stock In entries for that product on Day N
```

**Rule 4.3** Stock In recorded after the day is rolled over must be entered as an adjustment on the **current** day, not backdated silently.

---

## 5. Stock Out — Rules

Stock Out decreases the on-hand quantity. Every Stock Out event must record:

| Field | Description |
|---|---|
| `date` | The date the stock left |
| `product_id` | Which product |
| `quantity` | Units removed |
| `type` | Category: Sale / Damaged / Transfer Out / Wastage / Adjustment- |
| `reference` | Order ID, invoice, or memo |
| `recorded_by` | User who entered the record |
| `timestamp` | Exact time of entry |

**Rule 5.1** Stock Out is always a **positive** number representing units leaving.

**Rule 5.2** Multiple Stock Out entries on the same day are **summed**:
```
Total Stock Out (Day N) = SUM of all Stock Out entries for that product on Day N
```

**Rule 5.3 — Negative Stock Prevention**
Before confirming any Stock Out, the system must validate:
```
IF (Opening Qty + Stock In so far) - Proposed Stock Out < 0
   → BLOCK the transaction and raise an alert
```
Negative stock is never allowed unless an explicit "Allow Negative Stock" override is configured per product.

---

## 6. Adjustment Entries

Used to correct errors without altering historical records.

**Rule 6.1** Adjustments are always recorded on the **current date**, never on a past date.

**Rule 6.2** Every adjustment must include a mandatory reason/note field.

**Rule 6.3** Adjustment types:
- `Adjustment+` → treated as Stock In (increases stock)
- `Adjustment-` → treated as Stock Out (decreases stock)

**Rule 6.4** An audit trail of all adjustments is maintained permanently and is visible in reports.

---

## 7. Dashboard & Historical Data Viewing

### 7.1 Viewing Any Past Day

When a user selects **Date = Day X** on the dashboard, the system displays:

```
Opening Qty  → Closing Qty of Day (X-1)
Stock In     → SUM of all Stock In entries logged on Day X
Stock Out    → SUM of all Stock Out entries logged on Day X
Closing Qty  → Opening Qty + Stock In - Stock Out  (for Day X)
```

All four values are fully visible and correct for any historical date.

### 7.2 Viewing Today (Live / Current Day)

```
Opening Qty  → Closing Qty of yesterday (fixed, immutable)
Stock In     → Running sum of today's Stock In entries so far
Stock Out    → Running sum of today's Stock Out entries so far
Closing Qty  → Dynamically recalculated in real-time as entries are added
```

### 7.3 Date Range View

For a report spanning Day A → Day B:

```
Report Opening Qty  = Opening Qty of Day A
Report Total Stock In  = SUM of all Stock In across Day A to Day B
Report Total Stock Out = SUM of all Stock Out across Day A to Day B
Report Closing Qty  = Closing Qty of Day B
```

---

## 8. Data Storage Model

Each product gets one **Daily Inventory Record** per day:

```
DailyInventory {
  record_id       : UUID (primary key)
  product_id      : FK → Products
  date            : DATE (YYYY-MM-DD)
  opening_qty     : DECIMAL  ← never manually edited after day-roll
  stock_in        : DECIMAL  ← computed: SUM of StockIn entries
  stock_out       : DECIMAL  ← computed: SUM of StockOut entries
  closing_qty     : DECIMAL  ← computed: opening + stock_in - stock_out
  is_closed       : BOOLEAN  ← TRUE once day is rolled over (record is locked)
  created_at      : TIMESTAMP
  updated_at      : TIMESTAMP
}
```

Raw transaction log:

```
StockTransaction {
  txn_id          : UUID
  product_id      : FK → Products
  date            : DATE
  txn_type        : ENUM (StockIn, StockOut, Adjustment+, Adjustment-)
  quantity        : DECIMAL
  reference       : VARCHAR
  notes           : TEXT
  recorded_by     : FK → Users
  timestamp       : TIMESTAMP
}
```

The `DailyInventory` record's `stock_in`, `stock_out`, and `closing_qty` are always **derived** from `StockTransaction` — never entered independently.

---

## 9. Day-Close / Roll-over Process

This process runs once per day (automated scheduler or manual trigger):

```
FOR each active product:
  1. Compute stock_in  = SUM of StockIn transactions for today
  2. Compute stock_out = SUM of StockOut transactions for today
  3. Compute closing   = today.opening + stock_in - stock_out
  4. Save and LOCK today's DailyInventory record (is_closed = TRUE)
  5. Create tomorrow's DailyInventory record:
       tomorrow.opening = today.closing
       tomorrow.stock_in  = 0
       tomorrow.stock_out = 0
       tomorrow.closing   = tomorrow.opening (will update as txns come in)
       tomorrow.is_closed = FALSE
```

---

## 10. Edge Cases & Special Rules

**Rule 10.1 — New Product Mid-Period**
When a new product is added on Day N:
- Its Day N Opening Qty = 0 (or entered initial count)
- All previous days for this product are marked as non-existent (not zero)
- Reports for dates before Day N show "N/A" not "0" for this product

**Rule 10.2 — Deleted / Discontinued Product**
- Products are never hard-deleted
- Mark as `status = INACTIVE` from a given date
- All historical records are preserved and remain queryable

**Rule 10.3 — Timezone**
- The system operates on a single configured timezone for day boundaries
- All roll-overs happen at midnight of the configured timezone
- Transactions are stored in UTC but displayed in local time

**Rule 10.4 — Concurrent Transactions**
- Use database-level row locking or optimistic concurrency control
- Two Stock Out entries at the same time must not both succeed if together they would breach available stock

**Rule 10.5 — Manual Opening Override**
- Only a user with `ADMIN` role can override an Opening Quantity after it has been set
- Every such override is logged in the audit table with old value, new value, reason, and timestamp

---

## 11. Validation Rules Summary

| # | Rule | Action on Failure |
|---|---|---|
| V1 | `Closing = Opening + StockIn - StockOut` | Recalculate / Block save |
| V2 | Stock In quantity > 0 | Block entry |
| V3 | Stock Out quantity > 0 | Block entry |
| V4 | Closing Qty ≥ 0 (unless override) | Block Stock Out |
| V5 | Date of entry = today (for new entries) | Warn / Block if day is closed |
| V6 | Product must exist and be ACTIVE | Block entry |
| V7 | `Opening (Day N+1) = Closing (Day N)` | Auto-enforced on roll-over |
| V8 | Locked day records cannot be edited | Block edit, allow adjustment only |

---

## 12. Audit & Traceability

Every change in the system produces an audit log entry:

```
AuditLog {
  audit_id     : UUID
  entity_type  : VARCHAR  (e.g., "DailyInventory", "StockTransaction")
  entity_id    : UUID
  action       : ENUM (CREATE, UPDATE, DELETE, LOCK, OVERRIDE)
  old_value    : JSONB
  new_value    : JSONB
  performed_by : FK → Users
  timestamp    : TIMESTAMP
}
```

This ensures full traceability — any discrepancy in stock can be traced to the exact transaction and user.

---

*End of Rules Document*
