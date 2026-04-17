Here is a comprehensive PRD for the VPR Systems Inventory Management Platform:---

# VPR Systems — Product Requirements Document
**Inventory & Godown Management Platform**
Version 1.0 · April 2026

---

## 1. Purpose & Scope

VPR Systems is an internal web application for managing warehouse (Godown) stock across multiple locations. It tracks all product movements — inbound, outbound, and internal transfers — and provides real-time visibility into opening stock, closing stock, and planned quantities. The platform replaces manual spreadsheet workflows and introduces PDF-based stock comparison, automated notifications, and a live dashboard.

---

## 2. Data Model

The entire application is built on the following core data fields, derived from the existing spreadsheets.

**Inventory Product Record**
`Serial No · Item Name · Kgs · Godown Name · Date · Opening · Adjustment · In · Out · Closing Stock · In Kgs · Factory to Gdn`

**Stock List Record**
`Item Name · MUX · Godown Name · Closing Stock · In Kgs · Planned Qty · Closing Stock After Planning`

**Inbound / Outbound (In-Stock) Record**
`Timestamp · Party Name · Material Name · Quantity · Godown Name · Date · Transporter Name · In/Out · LR No. · From · Order Number`

---

## 3. Module Specifications

### 3.1 Godown Management

**Goal:** Allow administrators to define and manage physical warehouse locations.

**Fields per Godown:** Godown Name, Location/Address, Capacity (Kgs), Status (Active / Inactive), Created Date, Notes.

**Features:**
- Add, edit, and deactivate Godowns.
- Each Godown displays a summary card showing current total stock (Kgs) and number of active products stored.
- A Godown cannot be deleted if it holds active product records — it can only be deactivated.
- Godown list is filterable by status (Active / All).

---

### 3.2 Product Management

**Goal:** Maintain a master list of all products and their current warehouse location.

**Fields per Product:** Item Name, MUX, Current Godown Name, Serial No, Status (Active / Disabled), Last Updated Date.

**Features:**
- Add new products with all inventory fields (Item Name, Kgs, Godown Name, MUX, Planned Qty).
- **Product Edit Form:** A dedicated per-product editing screen showing all editable fields. Edits are versioned with a Last Updated timestamp. No bulk editing — each product is edited individually to reduce error risk.
- **Disable / Re-enable Products:** Products that will no longer arrive in future shipments can be marked Disabled. Disabled products are excluded from live stock views by default. A toggle ("Show Disabled") reveals them in a muted/greyed style, displaying their remaining closing stock highlighted in amber to signal residual inventory.
- Product list is filterable by Godown Name, Status, and Item Name (search).

---

### 3.3 Stock Management Form

**Goal:** The primary data entry interface for recording inbound and outbound stock movements.

**Form Fields (matching In-Stock data):**
`Party Name · Material Name (product lookup) · Quantity · Godown Name · Date · Transporter Name · In/Out · LR No. · From · Order Number`

**Features:**
- A single unified form handles both In and Out transactions (toggled via In/Out selector).
- Material Name is a searchable dropdown restricted to Active products.
- Godown Name is a dropdown restricted to Active Godowns.
- On submission, the system auto-calculates the new Closing Stock for that product in that Godown.
- Submitted entries are timestamped automatically.
- Inline validation ensures Quantity > 0 and Out quantity does not exceed current Closing Stock.
- A confirmation modal summarises the transaction before final save.

---

### 3.4 Internal Transaction Engine

**Goal:** Track product movements between Godowns ("Factory to Gdn" and inter-Godown transfers).

**Transaction Record Fields:**
`From Godown · To Godown · Item Name · Quantity (Kgs) · Date · Initiated By · Notes · Status (Pending / Completed)`

**Features:**
- Create an internal transfer record selecting source Godown, destination Godown, product, and quantity.
- System deducts from source Closing Stock and adds to destination Closing Stock upon completion.
- The `Factory to Gdn` field in the inventory record is updated to reflect factory-origin transfers specifically.
- Full transaction log with date range filter, Godown filter, and product filter.

**Notifications:**
- Every completed internal transfer generates an in-app notification: `"[Item Name] — [Qty] Kgs moved from [From] to [To] on [Date]"`.
- Notifications panel accessible from the top navigation bar with unread count badge.
- Notifications are dismissible and filterable by Godown and date.
- Optional: email notification to designated Godown contacts on transfer completion.

---

### 3.5 Live Stock Dashboard

**Goal:** Real-time inventory overview across all Godowns and products.

**Key Metrics displayed:**
| Metric | Derivation |
|---|---|
| Opening Stock | Start-of-day value per product per Godown |
| Total In | Sum of all In transactions for the period |
| Total Out | Sum of all Out transactions for the period |
| Adjustment | Manual adjustments recorded |
| Closing Stock | Opening + In − Out ± Adjustment |
| In Kgs | Weight-based closing stock |
| Planned Qty | From stock list |
| Closing Stock After Planning | Closing Stock − Planned Qty |

**Features:**
- Date range selector (default: current day). Supports day, week, and month views.
- Godown filter — view all Godowns combined or drill down to a single Godown.
- Product filter — search and isolate a specific item.
- Disabled products are hidden by default. A "Show Disabled" toggle reveals them with amber-highlighted residual closing stock.
- Stock rows where Closing Stock After Planning is negative are highlighted in red to signal shortfall.
- Export to CSV for the current view.

---

### 3.6 PDF Import & Product Comparison

**Goal:** Allow users to upload an external stock PDF (e.g. from a supplier or auditor) and automatically compare it against the live VPR inventory, flagging discrepancies.

**Workflow:**

1. User uploads a PDF from the comparison screen.
2. System parses the PDF and extracts rows matching the fields: Item Name, Quantity / Closing Stock, Godown Name (where present).
3. Extracted rows are matched against VPR records by Item Name (exact match first, then fuzzy match with confidence score).
4. A side-by-side comparison table is rendered:
   - **Green row:** PDF value matches VPR value within tolerance.
   - **Amber row:** Minor discrepancy (within a configurable ± threshold, default ±5 Kgs).
   - **Red row:** Significant discrepancy exceeding threshold, or item found in PDF but missing from VPR.
   - **Grey row:** Item found in VPR but absent from PDF (possibly new or unlisted).
5. User can click any highlighted row to open the Product Edit Form pre-filled with the VPR values, enabling a one-click correction.
6. User can accept, reject, or defer each discrepancy individually.
7. A summary card shows: Total Items Compared, Matched, Discrepancies, Missing from VPR, Missing from PDF.

**Parsing assumptions:** The PDF parser targets tabular data. It will handle common column layouts for Item Name and Quantity. Non-tabular or scanned PDFs require OCR processing (Phase 2 scope).

---

## 4. User Roles

| Role | Capabilities |
|---|---|
| Admin | Full access: all modules, Godown setup, product disable/enable, PDF comparison |
| Operator | Stock Form entry, view transactions, view dashboard |
| Viewer | Read-only dashboard and transaction log |

---

## 5. Non-Functional Requirements

- **Performance:** Dashboard loads within 2 seconds for up to 500 products across 10 Godowns.
- **Data integrity:** No stock entry can produce a negative Closing Stock without an explicit override confirmation.
- **Audit trail:** All edits to product records and all stock transactions are logged with user identity and timestamp.
- **Offline resilience:** The Stock Form should queue submissions locally if connectivity is lost and sync when restored.
- **Accessibility:** All forms must be keyboard-navigable and meet WCAG 2.1 AA contrast standards.

---

## 6. Out of Scope (Phase 1)

- Barcode / QR scanning integration.
- OCR for scanned (non-text) PDFs.
- Multi-user concurrent editing with live conflict resolution.
- Mobile native app (responsive web is sufficient for Phase 1).
- Automated reorder / purchase order generation.

---

## 7. Open Questions

1. Should the "Factory to Gdn" field be a distinct transaction type separate from general inter-Godown transfers, or treated as a special case of the same flow?
2. What is the acceptable PDF parsing tolerance before flagging a fuzzy match as uncertain?
3. Should disabled products' historical transaction data remain visible in the transaction log, or be archived?
4. Is there a designated approver role required before an internal transfer is marked Complete?

---

This PRD covers all nine feature areas you listed, wired to your exact field structure. Let me know if you want any module expanded into a detailed screen-by-screen specification, user flow diagrams, or a data schema.