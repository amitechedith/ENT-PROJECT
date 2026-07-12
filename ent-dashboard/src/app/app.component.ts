import { Component, HostListener } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common'; // Important for async pipe
import { AuthService } from './services/auth.service';
import { User } from './models/user.model';
import { Observable } from 'rxjs';
import { AccessTab } from './models/access-control.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'ent-dashboard';
  currentUser$: Observable<User | null>;
  isUserMenuOpen = false;
  patientLinkQueryParams: { patientId: number } | null = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    this.currentUser$ = this.authService.currentUser$;
    this.syncPatientContextFromUrl(this.router.url);

    this.currentUser$.subscribe(user => {
      if (user) {
        this.authService.loadAccessControls().subscribe({ error: () => undefined });
      }
    });

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.syncPatientContextFromUrl(event.urlAfterRedirects);
      }
    });
  }

  logout() {
    this.isUserMenuOpen = false;
    this.authService.logout();
  }

  toggleUserMenu(event: MouseEvent) {
    event.stopPropagation();
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  closeUserMenu() {
    this.isUserMenuOpen = false;
  }

  @HostListener('document:click')
  closeUserMenuOnOutsideClick() {
    this.closeUserMenu();
  }

  displayRoleLabel(role?: string): string {
    if (role === 'billing') {
      return 'Prescription';
    }

    return role ? role.toUpperCase() : '';
  }

  canAccessTab(user: User, tabKey: AccessTab): boolean {
    return this.authService.hasTabAccess(user.role, tabKey);
  }

  private syncPatientContextFromUrl(url: string): void {
    const queryString = url.split('?')[1] || '';
    const params = new URLSearchParams(queryString);
    const patientId = Number(params.get('patientId'));

    this.patientLinkQueryParams = Number.isFinite(patientId) && patientId > 0
      ? { patientId }
      : null;
  }
}
