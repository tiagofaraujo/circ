import React from 'react';
import {render,screen,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import AdminDashboardPage from './AdminDashboardPage';
const mockRows=[{id:'circ-2027-pending',eventId:'circ-2027',userId:'pending',participantName:'Pessoa Pendente',status:'submitted',payment:{status:'pending',amountCents:9500,currency:'EUR'}},
  {id:'legacy',participantName:'Registo Histórico',status:'draft',payment:{status:'paid',amountCents:0,currency:'EUR'}}];
jest.mock('../auth/AuthContext',()=>({useAuth:()=>({user:{uid:'admin',email:'circ.chuc@gmail.com'},signOut:jest.fn()})}));
jest.mock('../components/AdminModuleNav',()=>()=>null);
jest.mock('../auth/adminStore',()=>({paymentStatuses:['pending','paid','refunded'],subscribeToRegistrations:fn=>{fn(mockRows);return()=>{};},
  subscribeToRegistrationNotes:fn=>{fn({});return()=>{};},updateRegistrationNote:jest.fn(),resetDesignatedParticipantRegistration:jest.fn()}));
jest.mock('../auth/presenceStore',()=>({subscribeToUserStats:fn=>{fn({total:2,online:1});return()=>{};}}));
test('normal registration and payment statuses are read-only and historical mismatches are visible',()=>{
  render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AdminDashboardPage/></MemoryRouter>);
  expect(screen.getAllByRole('combobox')).toHaveLength(1);
  const pending=screen.getByText('Pessoa Pendente').closest('tr');
  expect(within(pending).getByLabelText('Estado da inscrição de Pessoa Pendente').tagName).toBe('SPAN');
  expect(within(pending).getByLabelText('Estado do pagamento de Pessoa Pendente')).toHaveTextContent('Pendente');
  expect(within(pending).queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByText('Estados por conferir — registo histórico')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Registar reembolso efetuado'})).not.toBeInTheDocument();
});
