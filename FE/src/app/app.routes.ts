import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { MapComponent } from './pages/map/map.component';
import { LoginComponent } from './pages/login/login.component';
import { authGuard } from './core/guards/auth.guard';
import { AuthRoles } from './dtos/auth/auth-roles';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard', component: DashboardComponent, canActivate: [authGuard],
    data: { allowedRoles: [AuthRoles.Admin, AuthRoles.Guest] }
  },
  {
    path: 'map', component: MapComponent, canActivate: [authGuard],
    data: { allowedRoles: [AuthRoles.Admin] }
  },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: '/dashboard' }
];
