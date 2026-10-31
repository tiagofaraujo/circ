import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import RegistrationRefund from './RegistrationRefund';
import {recordRegistrationRefund} from '../auth/refundStore';
jest.mock('../auth/refundStore',()=>({lisbonToday:()=> '2026-10-31',canRecordRegistrationRefund:r=>r.status==='confirmed'&&r.payment?.status==='paid',recordRegistrationRefund:jest.fn(async()=>({recorded:true}))}));
const registration={id:'circ-2027-owner',status:'confirmed',participantName:'Pessoa Exemplo',payment:{status:'paid',amountCents:9500}};
afterEach(()=>jest.restoreAllMocks());
test('refund requires completed payment acknowledgement, details and explicit confirmation',async()=>{
  jest.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValue(true);
  render(<RegistrationRefund user={{uid:'admin'}} registration={registration}/>);
  fireEvent.click(screen.getByRole('button',{name:'Registar reembolso efetuado'}));
  const submit=screen.getByRole('button',{name:'Guardar registo do reembolso'});expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Motivo'),{target:{value:'Desistência comunicada'}});
  fireEvent.change(screen.getByLabelText('Referência do reembolso'),{target:{value:'DEV-01'}});
  fireEvent.click(screen.getByLabelText('Confirmo que o valor total já foi devolvido.'));
  fireEvent.click(submit);expect(recordRegistrationRefund).not.toHaveBeenCalled();
  fireEvent.click(submit);await waitFor(()=>expect(recordRegistrationRefund).toHaveBeenCalledTimes(1));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('cancelar esta inscrição'));
});
test('pending payments have no manual paid or refund action',()=>{
  render(<RegistrationRefund user={{uid:'admin'}} registration={{...registration,status:'submitted',payment:{status:'pending'}}}/>);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
