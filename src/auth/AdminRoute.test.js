import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AdminRoute from './AdminRoute';
import { getUserAccess } from './firebaseClient';

jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));

function show(path, user, permission = 'registrations') {
  useAuth.mockReturnValue({ user, access: getUserAccess(user), loading: false });
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/admin" element={<AdminRoute permission="registrationReports"><h1>Consulta de inscrições</h1></AdminRoute>} />
      <Route path="/admin/faturacao" element={<AdminRoute permission={permission}><h1>Área financeira</h1></AdminRoute>} />
      <Route path="/conta" element={<h1>Área pessoal</h1>} />
      <Route path="/login" element={<h1>Entrar</h1>} />
    </Routes>
  </MemoryRouter>);
}
const viewer = { uid: 'paulo', email: 'paulojaneiro77@gmail.com', emailVerified: true };

test('a consultation account can open the registration reports route directly', () => {
  show('/admin', viewer);
  expect(screen.getByRole('heading', { name: 'Consulta de inscrições' })).toBeInTheDocument();
});

test('consultation does not grant access to financial routes and redirects safely to its own report', () => {
  show('/admin/faturacao', viewer);
  expect(screen.queryByRole('heading', { name: 'Área financeira' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Consulta de inscrições' })).toBeInTheDocument();
});

test('an unverified consultation email cannot open the reports route', () => {
  show('/admin', { ...viewer, emailVerified: false });
  expect(screen.getByRole('heading', { name: 'Área pessoal' })).toBeInTheDocument();
});

test('the administrator retains financial access and signed-out users need authentication', () => {
  const view = show('/admin/faturacao', { uid: 'owner', email: 'circ.chuc@gmail.com', emailVerified: true });
  expect(screen.getByRole('heading', { name: 'Área financeira' })).toBeInTheDocument();
  view.unmount();
  show('/admin', null);
  expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
});
