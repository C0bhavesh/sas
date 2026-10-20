import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { LedgerLite } from '../api/types';
import { createFakeClient } from '../testing/fakeClient';
import { BOOKS, LEDGERS, baseRoutes } from '../testing/sampleData';
import { renderScreen } from '../testing/render';
import { useLookups } from './Lookups';

function Probe() {
  const l = useLookups();
  return (
    <div>
      <p>{l.loading ? 'loading' : 'ready'}</p>
      {l.error && <p role="alert">{l.error}</p>}
      <ul aria-label="ledgers">{l.ledgerItems.map((i) => <li key={i.id}>{`${i.label}|${i.sub ?? ''}`}</li>)}</ul>
      <ul aria-label="receipt books">{l.booksFor('receipt').map((b) => <li key={b.id}>{b.code}</li>)}</ul>
      <ul aria-label="journal books">{l.bookItems('journal').map((b) => <li key={b.id}>{`${b.label}|${b.sub}`}</li>)}</ul>
      <button onClick={() => void l.reload()}>reload</button>
    </div>
  );
}

describe('LookupsProvider', () => {
  it('loads the ledgers and books of the company once', async () => {
    const { api } = renderScreen(<Probe />);
    expect(await screen.findByText('ready')).toBeInTheDocument();
    const items = screen.getByLabelText('ledgers').textContent;
    expect(items).toContain('Ramesh Traders|Sundry Debtors · Surat');
    expect(items).toContain('Cash|Cash-in-Hand');
    expect(api.calls.filter((c) => c.path.endsWith('/ledgers')).length).toBe(1);
  });

  it('offers only cash and bank books for receipts and only journal books for journals', async () => {
    renderScreen(<Probe />);
    await screen.findByText('ready');
    expect(screen.getByLabelText('receipt books').textContent).toBe('CB');
    expect(screen.getByLabelText('journal books').textContent).toBe('Journal|JV');
  });

  it('leaves blocked ledgers out of the picker', async () => {
    const blocked: LedgerLite = { ...LEDGERS[0]!, id: 'l-x', name: 'Old Account', status: 'blocked' };
    renderScreen(<Probe />, {
      routes: [{ method: 'GET', path: '/api/companies/c1/ledgers', reply: () => [...LEDGERS, blocked] }],
    });
    await screen.findByText('ready');
    expect(screen.getByLabelText('ledgers').textContent).not.toContain('Old Account');
  });

  it('reload picks up changes', async () => {
    const user = userEvent.setup();
    let extra: LedgerLite[] = [];
    renderScreen(<Probe />, {
      routes: [{ method: 'GET', path: '/api/companies/c1/ledgers', reply: () => [...LEDGERS, ...extra] }],
    });
    await screen.findByText('ready');
    extra = [{ ...LEDGERS[0]!, id: 'l-new', name: 'Brand New Party' }];
    await user.click(screen.getByRole('button', { name: 'reload' }));
    await waitFor(() => expect(screen.getByLabelText('ledgers').textContent).toContain('Brand New Party'));
  });

  it('reports a failure instead of crashing', async () => {
    renderScreen(<Probe />, {
      routes: [
        {
          method: 'GET',
          path: '/api/companies/c1/ledgers',
          reply: () => {
            throw new ApiError(0, 'NETWORK', 'Cannot reach the server.');
          },
        },
      ],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });
});

describe('fake routes used by the helper', () => {
  it('serve the sample data', async () => {
    const api = createFakeClient(baseRoutes());
    expect(await api.request('GET', '/api/companies/c1/books')).toEqual(BOOKS);
  });
});
