import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { renderScreen } from '../testing/render';
import { rightsFor, ME_CLERK } from '../testing/sampleData';
import { CompanyScreen, defaultFinancialYear } from './CompanyScreen';

describe('defaultFinancialYear', () => {
  it('April to March around today', () => {
    expect(defaultFinancialYear(new Date(2026, 9, 20))).toEqual({ label: '2026-27', start: '2026-04-01', end: '2027-03-31' });
    expect(defaultFinancialYear(new Date(2027, 1, 5))).toEqual({ label: '2026-27', start: '2026-04-01', end: '2027-03-31' });
    expect(defaultFinancialYear(new Date(2026, 3, 1))).toEqual({ label: '2026-27', start: '2026-04-01', end: '2027-03-31' });
    expect(defaultFinancialYear(new Date(2026, 2, 31))).toEqual({ label: '2025-26', start: '2025-04-01', end: '2026-03-31' });
  });
});

describe('CompanyScreen', () => {
  it('lists the companies and the years of the current one', async () => {
    renderScreen(<CompanyScreen />);
    expect(await screen.findByText('Test Textiles')).toBeInTheDocument();
    expect(screen.getByText('2026-27')).toBeInTheDocument();
    expect(screen.getByText('closed')).toBeInTheDocument(); // 2025-26
  });

  it('creates a company with the keyboard, then switches to it', async () => {
    const user = userEvent.setup();
    const bodies: any[] = [];
    const selected: string[] = [];
    let refreshed = 0;
    renderScreen(<CompanyScreen />, {
      session: { refreshCompanies: async () => void refreshed++, selectCompany: async (id) => void selected.push(id) },
      routes: [{ method: 'POST', path: '/api/companies', reply: ({ body }) => (bodies.push(body), { companyId: 'c2', yearId: 'y9' }) }],
    });
    await user.type(await screen.findByLabelText('Code'), 'C2{Enter}Second Traders{Enter}24ABCDE1234F1Z5{Enter}ABCDE1234F{Enter}24{Enter}');
    expect(screen.getByLabelText('Year name')).toHaveValue(defaultFinancialYear().label);
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('status')).toHaveTextContent('Company "Second Traders" created');
    expect(bodies[0]).toMatchObject({ code: 'C2', name: 'Second Traders', gstin: '24ABCDE1234F1Z5', pan: 'ABCDE1234F', stateCode: '24', fyLabel: defaultFinancialYear().label });
    expect(refreshed).toBe(1);
    expect(selected).toEqual(['c2']);
    expect(screen.getByLabelText('Code')).toHaveValue(''); // ready for another
  });

  it('asks for the code, name and a sensible year', async () => {
    const user = userEvent.setup();
    const { api } = renderScreen(<CompanyScreen />);
    await screen.findByLabelText('Code');
    await user.keyboard('{Control>}s{/Control}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Enter a company code');
    expect(alert).toHaveTextContent('Enter the company name');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows the server\'s message, e.g. for a duplicate code', async () => {
    const user = userEvent.setup();
    renderScreen(<CompanyScreen />, {
      routes: [{ method: 'POST', path: '/api/companies', reply: () => { throw new ApiError(409, 'DUPLICATE', 'That name or number already exists'); } }],
    });
    await user.type(await screen.findByLabelText('Code'), 'C1{Enter}Dup{Enter}');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByRole('alert')).toHaveTextContent('That name or number already exists');
  });

  it('is read-only for someone without the right to add companies', async () => {
    renderScreen(<CompanyScreen />, { session: { actor: ME_CLERK.actor, rights: rightsFor(), can: () => false } });
    expect(await screen.findByText(/do not have the right to create companies/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Code')).toBeNull();
  });
});
