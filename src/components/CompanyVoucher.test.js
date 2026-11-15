import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { useAuth } from '../auth/AuthContext';
import { subscribeCompanyRegistration } from '../auth/companyVouchers';
import { CompanyRegistrationGate } from './CompanyVoucher';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/companyVouchers', () => ({ subscribeCompanyRegistration: jest.fn() }));

const user = { uid: 'participant', emailVerified: true };
let publish, fail, unsubscribe;
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user });
  unsubscribe = jest.fn();
  subscribeCompanyRegistration.mockImplementation((currentUser, next, onError) => {
    publish = next;
    fail = onError;
    return unsubscribe;
  });
});

function show() {
  return render(<CompanyRegistrationGate>
    {registration => <p>{registration?.id || 'Nova inscrição'}</p>}
  </CompanyRegistrationGate>);
}

test('passes an existing company-covered registration from the authenticated owner to checkout', () => {
  const { unmount } = show();
  expect(screen.getByRole('status')).toHaveTextContent('A consultar a sua inscrição…');
  expect(subscribeCompanyRegistration).toHaveBeenCalledWith(user, expect.any(Function), expect.any(Function));
  act(() => publish({ id: 'circ-2027-participant', userId: user.uid, voucherId: 'company-voucher' }));
  expect(screen.getByText('circ-2027-participant')).toBeVisible();
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('only shows an existing registration when it belongs to the authenticated account', () => {
  show();
  act(() => publish({ id: 'circ-2027-other', userId: 'other' }));
  expect(screen.getByText('Nova inscrição')).toBeInTheDocument();
  expect(screen.queryByText('circ-2027-other')).not.toBeInTheDocument();
});

test('does not block eligibility instructions while the account email is unverified', () => {
  useAuth.mockReturnValue({ user: { ...user, emailVerified: false } });
  show();
  expect(screen.getByText('Nova inscrição')).toBeInTheDocument();
  expect(subscribeCompanyRegistration).not.toHaveBeenCalled();
});

test('leaves checkout blocked while the existing registration is unknown', () => {
  show();
  act(() => fail());
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível consultar a inscrição.');
  expect(screen.queryByText('Nova inscrição')).not.toBeInTheDocument();
});
