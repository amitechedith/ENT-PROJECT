import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map } from 'rxjs';
import { AccessTab } from '../models/access-control.model';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
    constructor(
        private router: Router,
        private authService: AuthService
    ) { }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        const currentUser = this.authService.currentUserValue;
        if (currentUser) {
            // check if route is restricted by role
            if (route.data['roles'] && route.data['roles'].indexOf(currentUser.role) === -1) {
                // role not authorised so redirect to home page
                this.router.navigate(['/']);
                return false;
            }

            const tabKey = route.data['tabKey'] as AccessTab | undefined;
            if (tabKey) {
                return this.authService.ensureAccessControlsLoaded().pipe(
                    map(() => {
                        if (!this.authService.hasTabAccess(currentUser.role, tabKey)) {
                            this.router.navigate(['/']);
                            return false;
                        }

                        return true;
                    })
                );
            }
            // authorised so return true
            return true;
        }

        // not logged in so redirect to login page with the return url
        this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
    }
}
