import type { ComponentType } from 'react';
import { Help } from '../screens/Help';
import { Home } from './Home';
import { BookScreen } from '../masters/BookScreen';
import { CompanyScreen } from '../masters/CompanyScreen';
import { LedgerScreen } from '../masters/LedgerScreen';
import { OpeningScreen } from '../masters/OpeningScreen';
import { AgeingReport } from '../reports/AgeingReport';
import { CashBookReport } from '../reports/CashBookReport';
import { BalanceSheetReport, ProfitLossReport, TrialBalanceReport } from '../reports/FinancialReports';
import { LedgerReport } from '../reports/LedgerReport';
import { VoucherEntry } from '../vouchers/VoucherEntry';
import { VoucherList } from '../vouchers/VoucherList';
import { SCREENS, type ScreenId } from './screens';

function placeholder(title: string): ComponentType {
  return function Placeholder() {
    return (
      <div className="panel">
        <h2>{title}</h2>
        <p className="muted">This screen is built in a later task.</p>
      </div>
    );
  };
}

const placeholders = Object.fromEntries(SCREENS.map((s) => [s.id, placeholder(s.title)])) as Record<ScreenId, ComponentType<any>>;

const Receipt = (p: { editId?: string }) => <VoucherEntry kind="receipt" editId={p.editId} />;
const Payment = (p: { editId?: string }) => <VoucherEntry kind="payment" editId={p.editId} />;
const Journal = (p: { editId?: string }) => <VoucherEntry kind="journal" editId={p.editId} />;

/** Every screen id maps to a component. Later tasks replace the placeholders. */
export const SCREEN_COMPONENTS: Record<ScreenId, ComponentType<any>> = {
  ...placeholders,
  home: Home,
  help: Help,
  receipt: Receipt,
  payment: Payment,
  journal: Journal,
  vouchers: VoucherList,
  company: CompanyScreen,
  ledgers: LedgerScreen,
  openings: OpeningScreen,
  books: BookScreen,
  rLedger: LedgerReport,
  rCashBook: CashBookReport,
  rTrial: TrialBalanceReport,
  rPL: ProfitLossReport,
  rBS: BalanceSheetReport,
  rAgeing: AgeingReport,
};
