import { Routes } from '@angular/router';
import { PatientRegistrationComponent } from './components/receptionist/patient-registration/patient-registration.component';
import { DoctorDashboardComponent } from './components/doctor/doctor-dashboard/doctor-dashboard.component';
import { ConsultationComponent } from './components/doctor/consultation/consultation.component';
import { BillingPageComponent } from './components/billing/billing-page/billing-page.component';
import { LoginComponent } from './components/auth/login/login.component';
import { AuthGuard } from './guards/auth.guard';
import { AdminDashboardComponent } from './components/admin/admin-dashboard/admin-dashboard.component';
import { ProfileComponent } from './components/auth/profile/profile.component';
import { PatientHistoryComponent } from './components/patient-history/patient-history.component';
import { DataEntryComponent } from './components/data-entry/data-entry.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  {
    path: 'reception',
    component: PatientRegistrationComponent,
    canActivate: [AuthGuard],
    data: { roles: ['receptionist', 'billing', 'admin', 'doctor'], tabKey: 'reception' }
  },
  {
    path: 'doctor/dashboard',
    component: DoctorDashboardComponent,
    canActivate: [AuthGuard],
    data: { roles: ['doctor', 'admin', 'receptionist', 'billing'], tabKey: 'doctor' }
  },
  {
    path: 'doctor/consult/:id',
    component: ConsultationComponent,
    canActivate: [AuthGuard],
    data: { roles: ['doctor', 'admin', 'receptionist', 'billing'], tabKey: 'doctor' }
  },
  {
    path: 'billing',
    component: BillingPageComponent,
    canActivate: [AuthGuard],
    data: { roles: ['billing', 'admin', 'doctor', 'receptionist'], tabKey: 'billing' }
  },
  {
    path: 'patient-history',
    component: PatientHistoryComponent,
    canActivate: [AuthGuard],
    data: { roles: ['billing', 'admin', 'doctor', 'receptionist'], tabKey: 'history' }
  },
  {
    path: 'admin',
    component: AdminDashboardComponent,
    canActivate: [AuthGuard],
    data: { roles: ['admin', 'doctor'] }
  },
  {
    path: 'data-entry',
    component: DataEntryComponent,
    canActivate: [AuthGuard],
    data: { roles: ['admin', 'doctor'] }
  },
  {
    path: 'profile',
    component: ProfileComponent,
    canActivate: [AuthGuard]
  }
];
