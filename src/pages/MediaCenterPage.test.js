import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';
import MediaCenterPage from './MediaCenterPage';
import manifest from '../data/mediaCenter.json';
jest.mock('../data/mediaAccess',()=>({mediaPreview:true,mediaVisible:true}));
function Toggle(){const {setLanguage}=useLanguage();return <button onClick={()=>setLanguage('en')}>English</button>;}
beforeEach(()=>localStorage.clear());
test('preview offers exactly four real file links, date and contact',()=>{
 const {container}=render(<MemoryRouter initialEntries={['/media']}><LanguageProvider><MediaCenterPage /></LanguageProvider></MemoryRouter>);
 expect(container.querySelectorAll('a[download]')).toHaveLength(4);
 for(const doc of manifest.documents)for(const f of Object.values(doc.files))expect(container.querySelector(`a[href="/media-files/${f.name}"]`)).not.toBeNull();
 expect(screen.getByText('29/09/2026')).toBeInTheDocument();
 expect(container.querySelector('a[href="tel:+351914004261"]')).not.toBeNull();
 expect(container.querySelector('a[href="mailto:circ.chuc@gmail.com"]')).not.toBeNull();
});
test('switching interface to English keeps Portuguese document language',()=>{
 render(<MemoryRouter initialEntries={['/media']}><LanguageProvider><Toggle/><MediaCenterPage/></LanguageProvider></MemoryRouter>);
 fireEvent.click(screen.getByText('English'));
 expect(screen.getByText('Information and resources for the press')).toBeInTheDocument();
 expect(screen.getAllByText(/Portuguese · Final version/)).toHaveLength(2);
 expect(document.title).toBe('Media Center | CIRC 2027');
 expect(document.head.querySelector('link[rel="canonical"]').href).toBe('https://circ-coimbra.org/media');
});
