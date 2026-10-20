# Accounting Software — Full Feature Specification

> Built from a study of the existing **JSM WinSoft** (JsmWinsoft v1.0.0) system: its menus, 167 database tables, ~400 report layouts, and GST/e-invoice integration.
> This is a **functional spec** of what JSM offers (what the software does), not a copy of JSM's code.

---

## 0. What kind of software this is

A **multi-company, multi-year, GST-compliant accounting + inventory + job-work** system for Indian trading/textile businesses.

Core ideas carried over from JSM:

| Concept | Meaning |
|---|---|
| **Company** | Each company has its own data, GSTIN, address, financial year. Many companies in one installation. |
| **Financial year** | Each year is separate; year-end closing carries forward balances, stock and pending bills. |
| **Book** | Every voucher belongs to a book (Sales A/c, Purchase Book, Cash/Bank Book, etc.). A company can have several books of the same kind (e.g. two sales series). |
| **Double entry** | Every transaction posts debit/credit lines into one central ledger table (`T_TRANDATA` in JSM). All reports read from there. |
| **Bill-wise tracking** | Every sales/purchase bill is tracked as outstanding until fully adjusted by receipts/payments/returns/notes. |
| **Pcs / Qty / Kgs** | Every item line can carry three quantities at once: pieces, quantity (metres/units) and weight (kgs). Textile essential. |
| **Broker / Haste / Transport** | Every sale/purchase can carry a broker (commission agent), "haste" (packer/delivery person), transport, LR no., station. |

---

## 1. Company & Year Management

- Create / select / edit company (menu: COMPANY → Select Company, New Company Master)
- Company fields: code, short name, full name (2 lines), signature name & designation, work type, 2 addresses (office + factory), city, pincode, 3 phones, fax, mobile, email, website, PAN, GSTIN, old CST/sales-tax no., TAN, Aadhaar, state code, bank details, from-date / to-date
- Company type flags: TDS applicable, TCS applicable
- E-way / e-invoice portal user ID & password per company
- Email password for sending bills by email
- **Multi-year chaining**: each year stores link to previous-year & next-year company/database
- Year flags: closed / open, main master Y/N, show on screen Y/N
- **Hide company from specific users**

---

## 2. Masters (menu: MST)

### 2.1 Account Master (Ledger / Party)
Fields:
- Account group, account code, name, alias, index code
- Address (3 lines), station/city, district, state, state code, pincode
- Office phone, residence phone, mobile, email, website, contact person
- Factory address block (2 lines, station, district, state, phone, mobile)
- GSTIN, PAN, Aadhaar, old CST no.
- **MSME**: registration no., type (micro/small/medium), year
- Opening balance + Dr/Cr; agency opening balance + Dr/Cr
- Credit/due days, interest %, dhara (discount) %, broker commission %
- Min / max credit level
- Default broker, transport, salesman, area, type (registered / unregistered / composition…)
- TDS %, education cess %, surcharge %, TCS %
- Bank details: 2 bank names + 2 account numbers
- Main-group (for consolidated ledgers), head1/2/3
- Include-tax flag, detail/summary flag, retail/tax flag
- E-commerce operator flag, HSN code (for service accounts)
- Account status (active / blocked) + status note, remark, date of birth, created date
- Book Y/N + book code (if this account itself is a cash/bank book)

### 2.2 Account Group Master
Standard hierarchy (Primary groups with type Assets / Liability / Income / Expense):

| Code | Group | Type |
|---|---|---|
| 1 | Fixed Assets | Assets |
| 2 | Investments | Assets |
| 3 | Current Assets | Assets |
| 4 | Misc. Expenses (Assets) | Assets |
| 5 | Capital Account | Liability |
| 6 | Current Liabilities | Liability |
| 7 | Loan (Liabilities) | Liability |
| 8 | Suspense Account | Liability |
| 9 | Branch / Division | Liability |
| 16 | Cash-in-Hand | Assets |
| 17 | Bank Balance | Assets |
| 19 | Loan & Advance (Assets) | Assets |
| 21 | Stock-in-Hand | Assets |
| 22 | Reserves & Surplus | Liability |
| 23 | Duties & Taxes | Liability |
| 24 | Provisions | Liability |
| 26 | Bank O/D Account | Liability |
| 27 | Secured Loans | Liability |
| 28 | Unsecured Loan | Liability |
| 29 | Trading Income | Income |
| 30 | Profit & Loss Income | Income |
| 31 | Trading Expense | Expense |
| 32 | Profit & Loss Expense | Expense |
| 35 | Sundry Creditors | Liability |
| 34/38/39/40/48 | Creditors for Others / Process / Brokerage / Salary / Jobwork | Liability (sub of 35) |
| 41 | Debtors for Others | Assets |
| 42 | Sundry Debtors | Assets |
| 56 | TDS on Process | Expense |

- User-defined sub-groups under any primary group
- **Per-group field visibility**: each group decides which fields the account form shows (Dr/Cr, broker, transport, GST, PAN, main-group, due days, audit, interest, max/min, TDS, edu, surcharge)

### 2.3 Main Account Group (MST_MN_GRP)
- Groups several ledger accounts of the same real party (e.g. same party in multiple cities/companies) for **merged ledgers & outstanding**

### 2.4 Book Master & Book Type
Book types:
1. Sales A/c
2. Purchase Book
3. Process Book
4. Sales Return
5. Purchase Return
6. Job Additional Book
7. Control Account
8. Production Book
9. Cash/Bank Book
10. Order Form

- Unlimited books per type (each with its own numbering series, print format, default ledger)

### 2.5 Item Master
- Item group, category code, item code, name, unit
- **Cut** (length per piece) and **Fold** % (textile)
- Min / max stock level
- Opening stock: pcs / qty / kgs / rate / value — **separately for**: own stock, Grey stock (G_), Mill stock (M_), Job-work stock (J_), Ready-finish (RF_)
- Sales rate, purchase rate, MRP, job rate, profit % rate
- HSN code, GST %, 2nd GST % (slab change above a price), tax slab code
- E-way bill product name & description (2 lines)
- Allow negative stock Y/N
- Rate per (pcs / qty / kgs) ×3
- 3 custom remarks + 3 custom values + total value
- Bundle size, brand, party group, "show in all forms" flag
- **Item image**
- **Item suit/set** (MST_IT_SUIT): one item made of multiple cuts
- **Stitch / embroidery design master** (MST_IT_STICH): design no., stitches, heads, total stitches, rate per stitch, rate per piece, job rate

### 2.6 Other masters
| Master | Purpose |
|---|---|
| Item Group | Category of items |
| Unit | PCS, QTY, KGS, NETQTY + GST UQC code |
| GST Tax Slab | Slab name, category, SGST, CGST, IGST, Cess |
| Station / City | Name, district, state, state code, pincode, **distance (km) for e-way bill** |
| State | GST state code list |
| Transport | Name, address, city, phone, GSTIN (transporter ID), email, pincode, state, mode (road/rail/air/ship), linked ledger |
| Type (Party tax type) | Invoice (in state), Invoice (out of state), Unregistered (in/out), Composition, Exempt & Nil rated — decides GST type |
| Party Bank (Drawee bank) | Bank names list for cheques |
| Godown | Warehouse code, name, address |
| Colour, Size | For variant-wise stock |
| Area, Salesman | For territory-wise reports |
| Item-wise Rate Master | Party-wise / station-wise special rate per item |
| Date-wise Rate | Item rate effective by date |
| Online Key-list | Function-key shortcuts that auto-fill a party/station/transport/packing rate in an entry form |
| Vehicle, Driver | Vehicle no., type, engine, chassis, insurance, owner; driver licence |
| Tank, Pump | Petrol-pump module masters |
| Opening Balance entry | Bulk entry of ledger opening balances |
| Opening Stock entry | Bulk entry of item opening stock |
| Last-Year Bill entry | Enter pending bills of previous year for bill-wise outstanding |

---

## 3. Transactions (menu: TRAN)

### 3.1 Sales Invoice
Header:
- Book, entry no. (internal), serial no., bill no. (numeric + char + full), bill date
- Challan no. & date, order no. & date, lot no.
- Party (bill-to), **delivery party** (ship-to), broker, station, transport, type (GST type), haste/packer, salesman
- LR no., LR date, weight, freight, bale no.
- Due days → auto due date
- Remarks ×3
- Dollar rate (export)

Item grid (per line):
- Item, HSN, fold, cut, pcs, qty, qty1, kgs, rate, MRP, amount
- Up to 6 line discounts (% and amount), fold %/amount
- Rate-difference (RD) rate/amount, add %, add amount, line add/less
- SGST / CGST / IGST % and amount, Cess % and amount
- Taxable value, round-off, final line amount
- Bale no., lot no., reference challan/order, inward qty, shortage qty, chadti (textile allowance)
- Gross pcs, gross kgs, less kgs (tare)
- Embroidery remarks, packing rate, sale rate
- Purchase link (purchase party, purchase bill, purchase less %) — for **back-to-back sale/purchase & profit tracking**

**Per-line detail (sub-grid)** (T_SL_DT): every line can expand into individual pieces/takas: qty, cut, pcs, net-qty, weight, colour, size, remark.

Footer:
- Sub total, up to **7 configurable Add/Less heads** (each with %, amount, +/−, ledger to post) — see 3.12
- Total add / total less
- TDS on amount, TDS % / amount; TCS % / amount
- SGST / CGST / IGST / Cess totals, GST %, taxable amount
- Round-off, net total
- Broker commission %
- **E-way bill no., date, valid-upto**
- **E-invoice IRN, Ack no., Ack date, signed QR code image**
- Print copy count (Original / Duplicate / Triplicate)
- Created by / time, modified by / time

### 3.2 Sales Return (Credit Note against goods)
- Same as sales + link to original bill, bill amount, received amount, net bill
- GST difference handling, e-invoice QR/IRN for credit note

### 3.3 Purchase Invoice
- Same structure as sales, plus:
- Supplier's bill no., challan, order
- TDS (with TDS section/code, date), TCS, education cess
- **Reverse charge** Y/N + amount
- **ITC eligibility** flag
- Other book link, sale bill link
- Return-filing reconcile date (R_CON_DATE), GSTR-2A bill no.

### 3.4 Purchase Return (Debit Note against goods)
- Same as purchase return structure + process type, GST difference

### 3.5 Sales Order / Purchase Order (Order Form)
- Same as invoice, with order status open/closed, issued vs. stock qty, balance
- Convert order → challan → invoice

### 3.6 Sales Challan / Purchase Challan (Delivery note)
- Goods movement without bill; later converted to bill
- Challan detail: carton no., design no., quality, yard, net weight, gross weight

### 3.7 Cash / Bank Book (Receipt & Payment)
Menu: Cash Book Rec, Cash Book Pay, Bank Book Rec, Bank Book Pay
- Receipt/Payment, book (cash or bank), party, date, amount
- Cheque no., cheque date, drawee bank, cheque in stock (post-dated), slip no., cheque return + return date
- Pay name on cheque, inter-branch no.
- Broker + commission %/amount on payment, expense voucher no.
- **Bill-wise adjustment grid** (T_CASH_RPD): shows all pending bills of party → select bills → enter received amount, up to 7 deductions per bill (discount, RD, RG, claim, BC, interest…), TDS, part-payment, close bill
- **On-account / unadjusted** receipts (T_UNADJUST), later adjusted
- Lock entry flag

### 3.8 Journal Voucher (Voucher Entry)
- Multi-line Dr/Cr (T_JV_BOOK + T_JV_DETAIL)

### 3.9 GST Journal / Debit-Credit Note (T_JV_GST)
- Expense/income bill with GST (e.g. rent, freight, service bills)
- Dr account, Cr account, amount, GST code, SGST/CGST/IGST, TDS (code, %, amount, date)
- Reverse charge, HSN, UQC, exp/inc flag, round-off
- Party voucher no. & date, note-adjust bill no., reason for issuing note
- Bill-wise adjustment against sales/purchase
- E-invoice QR/IRN for notes

### 3.10 TDS Book
- Party, TDS head, amount, TDS/surcharge/edu %, amounts
- Challan: cheque/DD, payment date, BSR code, challan serial

### 3.11 Brokerage / Commission
- Commission voucher: broker, bill amount, commission %, amount
- Commission detail by bill (paid date, old/new)
- **Broker tax invoice** (for brokers who bill with GST)

### 3.12 Add/Less (Discount) Setup — configurable
Columns configured once per company and applied in sales/purchase/receipts:

| Head | Effect |
|---|---|
| DISCOUNT | − |
| RD (rate difference) | − |
| RG (goods returned / rebate) | − |
| CLAIM | − |
| BC (bank charges) | − |
| HEAD1, HEAD2 (custom) | − |
| INTEREST | + |
| CLOSE BILL | close remaining balance |

Each head: display order, heading, ledger to post, +/−, show % column, show amount column, calculate-on amount.

### 3.13 Slip (Petrol pump / counter slip), Stock Pump
- Slip entry by account / vehicle, item, qty — **petrol pump module**

### 3.14 FR Entry / Activate No.
- Franchise/recharge entries with amount, date, CAF no., mobile, activation date (mobile-SIM business module)

### 3.15 Agency module
- Separate agency ledger (T_AGENCY_TRANDATA) and unadjusted entries — for businesses acting as commission agent for suppliers

### 3.16 Investment register
- Mutual fund / share transactions: folio, scheme, units, NAV, STT, brokerage, TDS, exit load, current NAV value, dividend

### 3.17 Stock Journal
- Item conversion / production: consume items → produce item, rate, cost

---

## 4. Inventory & Job-work / Process (textile manufacturing)

Menu: TRAN → INVENTORY / PROCESS / WORK PROCESS

### 4.1 Process (Mill) Issue — grey sent to dyeing/printing mill
- Mill challan no., date, mill (party), purchase party & bill (where grey came from), item, pcs, qty, kgs, purchase rate, job rate, lot no., job no.
- Single / multi-item, transport, LR no., marka no., master name
- **Taka-wise detail** (I_MILL_CH_DTL): individual pieces sent
- Pending / received / balance pcs, qty, kgs
- Re-finish flag (re-process)

### 4.2 Process (Mill) Receipt / Mill Bill
- Receive finished goods against issue: sent qty, received qty, shortage, fold qty, chadti, kgs
- Mill bill: rate, amount, process type, TDS, GST (with reverse charge), due date
- **Shortage % auto-calculation**

### 4.3 Job-work Issue (Work Process Issue)
- Issue to job-worker (stitching, embroidery, cutting…): challan, item, pcs, qty, kgs, job rate, lot, job card no., HSN, GST, LR, bale
- Link to job card

### 4.4 Job-work Receipt / Job Bill
- Receive pcs/qty/kgs, shortage, plain pcs/qty, cut-pending
- Job bill with TDS, GST, reverse charge, add/less, due date

### 4.5 Job Card
- Job card with issued vs received pcs/qty, shortage, status

### 4.6 Cutting Entry
- Lot-wise cutting of fabric into pieces: item, cut, pcs, qty, kgs, colour, size, cutting master

### 4.7 Embroidery Inward / Digital-print Inward
- Inward from job-worker by design no., colour, pcs, cut, qty, job rate, amount

### 4.8 Multi-Issue
- Issue many items to many parties in one entry

### 4.9 Weaving / Production (Loom module)
- **Beam entry**: beam no., item, warp date, beam qty, machine no., denier, ends, reed, pick, width, weights, maker & spreader with rates
- **Production (taka) entry**: machine, beam, taka no., fold date, metres, weight, design; worker-wise qty × rate wages

### 4.10 Stock categories maintained separately
- Grey at shop, Grey at mill, Grey at job-work, Finish at shop, Cutting stock, Ready-finish, Purchase stock
- Colour/size-wise stock

---

## 5. GST & Compliance

- Auto **CGST+SGST vs IGST** by comparing company state and party/place-of-supply state
- Party tax types: registered in/out state, unregistered in/out state, composition, exempt/nil
- HSN-wise and slab-wise tax, Cess, 2nd slab above threshold price
- **GSTR-1** export (JSON/Excel offline tool format, e.g. `..._GSTR1_V3_2_2.xlsx`)
- **GSTR-3B** Excel export
- **GSTR-2A / 2B reconciliation**: import portal file → match with purchase register by GSTIN + invoice no. → status Matched / Not in books / Not in portal / Amount mismatch; month & year wise
- **E-Invoice (IRN)** generation via GSP/ASP API (TaxPro), store IRN, Ack no., Ack date, QR image — for sales, sales return, GST notes
- **E-Way bill** generation via API (with or without e-invoice), store no., date, valid-upto; uses station distance & transporter GSTIN
- TDS: section/head master, party-wise deduction, challans, **TDS certificate (Form 16A)**, quarterly data
- TCS on sales/purchase, TCS summary/detail reports
- **3CD (tax audit) helper summary**
- MSME tracking (for 45-day payment rule)
- Reverse charge, ITC eligibility
- Old VAT reports (legacy)

---

## 6. Reports

### 6.1 FAS (Financial Accounting) Reports
- **Cash / Bank book**: daily, voucher-wise, detail, **Rojmel (cash day book)**
- **Cash flow**
- **Voucher (JV) book**
- **Ledger** — many formats:
  - Account-wise, with/without index, dot-matrix / laser layout
  - Account-head (group) wise, city-wise, main-group-wise, main-group **merged**
  - Summary 1 / Summary 2
  - **T-format** ledger
  - **Account confirmation letter**
  - **Multi-company ledger** (account / head / city, company-wise)
- Sales register, Purchase register, Sales return, Purchase return (normal / party / broker / city wise)
- **Bank reconciliation** (with clear date)
- **Interest ledger / interest calculation** (regular, chart, agency)
- Slip register
- Sales by broker / haste (packer) / transport
- Sales outstanding + receipt detail

### 6.2 Final Reports
- **Trial balance**: opening or current; single or double column; account / group / schedule / summary
- **Profit & Loss** (several layouts, laser)
- **Balance Sheet**: single / double; account / group / schedule
- Account balances with address

### 6.3 Outstanding (O/S) Reports
- Sales O/S: normal, account-wise, broker-wise, city-wise, main-group-wise, part-payment, letter format
- **Ageing** (account / broker)
- **O/S with interest**
- Purchase O/S: normal, account, broker, city, main-group
- Job-work O/S, process O/S, transport O/S
- **Multi-company O/S** (normal / account / broker / city)
- Ledger vs O/S difference check
- Debtors, Creditors, Debtors-transport, Debtors-age, Debtors multi-co

### 6.4 Stock Reports
- Stock ledger (item-wise movements)
- Stock item-wise / category-wise: normal, date-wise, monthly
- Stock with value (item / category, valuation)
- Stock detail pcs / qty, serial-no status, box/item-description
- **Gross profit** (item / summary / yearly)
- Stock metre reports: grey at shop, grey at mill, grey at job-work, finish at shop, kgs versions, summary
- Mill stock (item / mill / purchase-party wise, landscape)
- Job stock (item / party wise)
- Cutting stock, purchase stock
- Petrol stock date/month-wise, cash-credit sales

### 6.5 Mill / Process / Job Reports
- Mill send: normal / item / mill-wise / lot-wise / purchase-party wise
- Mill receipt: detail / summary, **taka-wise**, finish-item wise
- **Lot-wise costing** (item / mill / normal / kgs / value)
- Cutting: pending, clear, detail, summary
- Jobwork challan status, job bill, process payment, work-process payment, outstanding jobwork

### 6.6 Monthly / Periodic
- Monthly / quarterly / half-yearly / yearly sales & purchase
- Sales detail, purchase detail, sales stock, **sales profit**, sales haste/packer wise

### 6.7 TDS Reports
- Head-wise, head + date wise, company/non-company, party-wise (summary / with cheque detail), month-wise, challan, certificate

### 6.8 GST / VAT Reports
- Sales/purchase tax detail category-wise and item-wise, cess detail, summary monthly/quarterly/yearly, type-wise

### 6.9 Other Reports
- Account lists (account-wise, broker-wise, group-wise, transport-wise), item list, item-group list
- **Brokerage statement** (by account / date / selected)
- **RG pending** (goods return pending: normal / account / broker / city)
- Sales receipts / purchase payments register
- **Daily transaction** list
- **Greater / less than ₹X** (high-value transaction check)
- Rate-list printing
- **Address labels** (for posting)
- **Letter pad**
- Last-year difference check (detail / summary)
- Share stock
- **Customize report** — user picks fields to build own sales report (party / item / party+item)

### 6.10 Report features (all reports)
- Date range, company, book, party/broker/city/group filters
- Print (dot-matrix & laser layouts), PDF export, Excel export
- **Send via WhatsApp / SMS / Email** with configurable message templates per report type (Sales, Sales Return, Purchase, Purchase Return, Mill Issue/Receipt, Job Issue/Receipt, O/S, Ledger, Payment, Purchase Order, Payment slip)

---

## 7. Bill / Document Printing
- Sales invoice formats (account, dyed, sarees, GSTIN layouts, custom per client)
- Challan formats
- Jobwork issue challan, payment voucher, cash voucher, receipt
- Print Original / Duplicate / Triplicate
- QR code (e-invoice) printed on bill
- Bill print range (Bill No X to Y) → PDF auto-save to a reports folder

---

## 8. Users & Security
- Login with username / password
- **Per-user rights per module**: Add, Edit, Delete, Print, Find, Show menu
- Per-user rights on **account groups** (user cannot see some groups)
- Hide specific companies from a user
- Bill-saving password, user email for bill sending
- **Audit log**: every add/edit/delete of bills, item lines, cash entries and issues stored with user + time + old values (R_LOGMAIN, R_LOGDETAIL, R_LOGCASH, R_LOGISSUE)
- Created-by / modified-by stamps on every voucher
- **Data freeze**: lock a month/period so no one can change entries before that date
- Transfer lock
- Client PC registration (licence per PC)

---

## 9. Utilities (menu: UTILITY)
- **Backup / Restore** (auto backup batch files for main & setting DB)
- **Closing / Unclosing year**
- **New accounting year** creation
- **Transfer to next year** (balances, stock, pending bills)
- Update O/S bill status (sales & transport)
- Refresh O/S bills
- Unadjusted entry setup
- **Voucher re-index** (renumber)
- **Missing entry check** (gaps in bill numbering)
- **Auto expense entry** (recurring)
- Update main account master
- Extra events / reminders (date, description, amount, remind-before days) — e.g. insurance, rent, EMI due

---

## 10. Settings (menu: SETUP_SYSTEM)
- Company-wise settings for every form (which columns show, defaults, rounding, VAT/GST calc method, TDS head, job book)
- Add/Less column setup (3.12)
- SMS API setup (provider, user, sender ID, password, templates)
- WhatsApp message templates per document type
- E-invoice / E-way API credentials (GSP/ASP)
- Report field selection for SMS/WhatsApp (field, display name, length, order)

---

## 11. Data Model Summary (JSM's core tables)

| Area | Tables (JSM name → purpose) |
|---|---|
| Company | J_COMPANY, J_COMPANY_DTL |
| Users | J_LOGIN, J_LOGIN_DT, J_USER_STP, J_USER_GRHEAD, J_USER_OPTION |
| Masters | MST_AC_MAST, MST_ACG_MAST, MST_MN_GRP, MST_BOOK_MN, MST_IT_MAST, MST_ITG_MAST, MST_UNIT, MST_IT_TAX_SLAB, MST_STATION, MST_STATE, MST_TR_PORT, MST_TYPE, MST_DRAW_BANK, MST_GODWON, MST_COLOUR, MST_SIZE, MST_AREA, MST_IT_RATE_MAST, MST_RATE_DATEWISE, MST_ONLN_KEY, MST_VEHICLE, MST_DRIVER, MST_TANK |
| Sales | T_SALES (header), T_SL_ITEM (lines), T_SL_DT (piece detail), T_SL_RETU / T_SLR_ITEM / T_SLR_DT |
| Purchase | T_PURCHASE, T_PU_ITEM, T_PU_DT, T_PU_RETU, T_PUR_ITEM, T_PURTN_DT |
| Orders / Challans | I_SL_ORDER, I_SL_ORD_IT, I_PU_ORDER, I_PU_ORD_IT, I_SL_CHALLAN, I_SL_CH_IT, I_SLCH_DT, I_PU_CHALLAN, I_PU_CH_IT |
| Cash / Bank | T_CASH_MN (header), T_CASH_RPD (bill adjustment), T_UNADJUST |
| Journal | T_JV_BOOK, T_JV_DETAIL, T_JV_GST, T_JV_GST_BILL |
| **Ledger posting** | **T_TRANDATA** — every Dr/Cr line from every voucher |
| Outstanding | T_OS_BILL — every bill with pending amount |
| TDS / Commission | T_TDS_BOOK, T_COMMI_MN, T_COMMI_RPD |
| Mill / Job | I_MILL_CH, I_MILL_CH_DTL, I_MILL_GP, I_MILL_IT, I_MILL_DT, I_JOB_ISSUE, I_JOB_RECEIPT, I_JOB_REC_IT, I_JOBCARD_REC, I_CUT_MAIN, I_CUT_DETAIL, I_EMB_INWARD, I_DIGITAL_INWARD |
| Production | L_BEAM_ENTRY, L_PRODUCTION, L_PRODUCTION_DETAIL, I_STK_JV_MAIN, I_STK_JV_DETAIL |
| GST | J_GSTR_2B_NEW, J_TAXPRO_USER_DETAILS, IMG_QR_SALES, IMG_QR_SL_RETU, IMG_QR_JV_GST |
| Audit | R_LOGMAIN, R_LOGDETAIL, R_LOGCASH, R_LOGISSUE, J_FREEZEDATA |
| Misc | J_REMNDERLOG, J_SMS_API, STP_WH_MSG, J_AddLessSetup, I_INVESTMENT |

**How JSM links them:** every voucher table carries company path, entry no., book code, serial no., bill no., date, open/close flag, created-by/time and modified-by/time. Each voucher's Dr/Cr lines are posted into the ledger table (T_TRANDATA), and each bill is tracked in the outstanding table (T_OS_BILL).
