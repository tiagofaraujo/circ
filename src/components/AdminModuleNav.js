import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const modules = [
  { to: '/admin/transferencias', number: '08', label: 'Transferências', permission: 'canManageRegistrations', ownerOnly: true },
  { to: '/admin/faturacao', number: '07', label: 'Faturação', permission: 'canManageRegistrations' },
  { to: '/admin/empresas', number: '05', label: 'Empresas', permission: 'canManageRegistrations' },
  { to: '/admin', end: true, number: '01', label: 'Inscrições', permission: 'canManageRegistrations' },
  { to: '/admin/submissoes', number: '02', label: 'Submissões', permission: 'canManageSubmissions' },
  { to: '/admin/avaliacoes', number: '06', label: 'Avaliações', permission: 'canManageSubmissions' },
  { to: '/admin/secretariado', number: '03', label: 'Secretariado', permission: 'canUseSecretariat' },
  { to: '/admin/estudantes', number: '04', label: 'Estudantes', permission: 'canUseSecretariat' },
];

export default function AdminModuleNav() {
  const { access, isAdmin } = useAuth();
  const visibleModules = modules.filter((module) => access?.[module.permission] && (!module.ownerOnly || isAdmin));

  return (
    <nav className="admin-module-nav" aria-label="Módulos de administração">
      {visibleModules.map((module) => (
        <NavLink
          key={module.to}
          to={module.to}
          end={module.end}
          className={({ isActive }) => (isActive ? 'is-active' : '')}
        >
          <span>{module.number}</span>
          <strong>{module.label}</strong>
        </NavLink>
      ))}
    </nav>
  );
}
