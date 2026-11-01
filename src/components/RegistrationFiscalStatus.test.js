import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegistrationFiscalStatus from './RegistrationFiscalStatus';
import { useAuth } from '../auth/AuthContext';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
const ID='11111111-1111-4111-8111-111111111111';
const registration={isTest:false,userId:'participant',payment:{status:'paid',method:'multibanco',orderId:ID}};
const pending={id:ID,status:'paid',fiscalStatus:'pending_authorization',canResumeFiscal:true,amountCents:5500,currency:'EUR'};
const response=order=>({ok:true,json:async()=>({order})});
function show(){return render(<MemoryRouter><RegistrationFiscalStatus registration={registration}/></MemoryRouter>);}
beforeEach(()=>{global.fetch=jest.fn();useAuth.mockReturnValue({isAdmin:true,user:{uid:'admin',getIdToken:async()=>'session'}});});
test('admin explicitly confirms the existing participant invoice before one resume POST',async()=>{
 fetch.mockResolvedValueOnce(response(pending)).mockResolvedValueOnce(response({...pending,fiscalStatus:'issued',canResumeFiscal:false}));
 show();fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 const confirm=screen.getByRole('button',{name:'Confirmar retoma'});expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(confirm);
 expect(await screen.findByText('Fatura-recibo emitida')).toBeInTheDocument();
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({confirmation:'RETOMAR FATURACAO AUTORIZADA'});
});
test('issued, unknown and unapproved jobs never offer a retry',async()=>{
 for(const order of [{...pending,fiscalStatus:'issued'},{...pending,fiscalStatus:'outcome_unknown'},{...pending,canResumeFiscal:false}]){
  fetch.mockResolvedValueOnce(response(order)); const view=show();fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('status');expect(screen.queryByRole('button',{name:'Retomar faturação autorizada'})).not.toBeInTheDocument();view.unmount();
 }
});
test('a lost POST response locks another attempt until a fresh successful read',async()=>{
 fetch.mockResolvedValueOnce(response(pending)).mockRejectedValueOnce(new Error('network'));
 show();fireEvent.click(screen.getByRole('button'));fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirmar retoma'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('O resultado da retoma requer consulta');
 expect(screen.getByRole('button',{name:'Confirmar retoma'})).toBeDisabled();expect(fetch).toHaveBeenCalledTimes(2);
});
test('non-administrators cannot use the fiscal controls',()=>{
 useAuth.mockReturnValue({isAdmin:false,user:{uid:'participant'}});show();expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
});
