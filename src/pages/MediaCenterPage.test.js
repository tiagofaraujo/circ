import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';
import MediaCenterPage from './MediaCenterPage';
import manifest from '../data/mediaCenter.json';
jest.mock('../data/mediaAccess',()=>({mediaPreview:true,mediaVisible:true,useMediaAccess:()=>true}));
function Toggle(){const {setLanguage}=useLanguage();return <button onClick={()=>setLanguage('en')}>English</button>;}
beforeEach(()=>localStorage.clear());
test('preview offers all published press and graphic downloads, date and contact',()=>{
 const {container}=render(<MemoryRouter initialEntries={['/media']}><LanguageProvider><MediaCenterPage /></LanguageProvider></MemoryRouter>);
 expect(container.querySelectorAll('a[download]')).toHaveLength(11);
 for(const doc of manifest.documents)for(const f of Object.values(doc.files))expect(container.querySelector(`a[href="/media-files/${f.name}"]`)).not.toBeNull();
 expect(container.querySelector('a[download][href="/media-assets/Cartaz_2027_RGB-3000.jpg?download=1"]')).not.toBeNull();
 expect(container.querySelector('a[download][href="/media-assets/CIRC2027_LOGO_VETORIAL.pdf?download=1"]')).not.toBeNull();
 for(const name of ['Digitial_1920x1080-TORRE.jpg','Digitial_1350x1080-TORRE.jpg','Digitial_1080x1350-TORRE.jpg','Digitial_1080x1920-TORRE.jpg']) expect(container.querySelector(`a[download][href="/media-assets/${name}?download=1"]`)).not.toBeNull();
 expect(container.querySelector('img[src="/identity2027/circ2027-social-20260928.jpg"]')).toBeNull();
 expect(screen.getByText('29/09/2026')).toBeInTheDocument();
 expect(screen.getByText(/Distribuição à imprensa autorizada a partir de 16 de outubro de 2026/)).toBeInTheDocument();
 expect(container.querySelector('a[href="tel:+351914004261"]')).not.toBeNull();
 expect(container.querySelector('a[href="mailto:circ.chuc@gmail.com"]')).not.toBeNull();
});
test('switching interface to English keeps Portuguese document language',()=>{
 render(<MemoryRouter initialEntries={['/media']}><LanguageProvider><Toggle/><MediaCenterPage/></LanguageProvider></MemoryRouter>);
 fireEvent.click(screen.getByText('English'));
 expect(screen.getByText('Information and resources for the press')).toBeInTheDocument();
 expect(screen.getAllByText(/Portuguese · Final/)).toHaveLength(2);
 expect(screen.getByText(/Authorised for press distribution from 16 October 2026/)).toBeInTheDocument();
 expect(document.title).toBe('Media Center | CIRC 2027');
 expect(document.head.querySelector('link[rel="canonical"]').href).toBe('https://circ-coimbra.org/media');
});
