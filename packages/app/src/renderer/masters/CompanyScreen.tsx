import { SCREEN_BY_ID } from '../shell/screens';
import { useSession } from '../session/Session';
import { DataTable } from '../ui/DataTable';
import { NewCompanyForm } from '../pages/NewCompanyForm';

export { defaultFinancialYear } from '../pages/NewCompanyForm';

export function CompanyScreen() {
  const session = useSession();
  const allowed = session.can('company', 'add');

  return (
    <div>
      <h2>Company & Years</h2>
      <div className="panel">
        <DataTable
          caption="Companies"
          columns={[
            { key: 'code', header: 'Code', value: (c) => c.code },
            { key: 'name', header: 'Company', value: (c) => c.name },
          ]}
          rows={session.companies}
          rowKey={(c) => c.id}
          emptyText="No companies yet"
        />
        {session.company && (
          <>
            <h3 style={{ marginTop: 12 }}>Years of {session.company.name}</h3>
            <DataTable
              caption="Years"
              columns={[
                { key: 'label', header: 'Year', value: (y) => y.label },
                { key: 'status', header: 'Status', value: (y) => y.status },
              ]}
              rows={session.years}
              rowKey={(y) => y.id}
            />
          </>
        )}
      </div>

      {!allowed ? (
        <p className="muted">You do not have the right to create companies.</p>
      ) : (
        <NewCompanyForm
          shortcuts={SCREEN_BY_ID.company.shortcuts}
          onCreated={async (companyId) => {
            await session.refreshCompanies();
            await session.selectCompany(companyId);
          }}
        />
      )}
    </div>
  );
}
