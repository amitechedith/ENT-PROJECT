import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User } from '../models/user.model';
import { BehaviorSubject, Observable, map, of, catchError, switchMap, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AccessControl, AccessTab } from '../models/access-control.model';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly defaultAccessControlTemplate: Array<Omit<AccessControl, 'doctorId'>> = [
        { targetRole: 'receptionist', tabKey: 'reception', isAllowed: true },
        { targetRole: 'receptionist', tabKey: 'doctor', isAllowed: false },
        { targetRole: 'receptionist', tabKey: 'billing', isAllowed: true },
        { targetRole: 'receptionist', tabKey: 'history', isAllowed: true },
        { targetRole: 'billing', tabKey: 'reception', isAllowed: false },
        { targetRole: 'billing', tabKey: 'doctor', isAllowed: false },
        { targetRole: 'billing', tabKey: 'billing', isAllowed: true },
        { targetRole: 'billing', tabKey: 'history', isAllowed: true }
    ];
    private currentUserSubject = new BehaviorSubject<User | null>(null);
    private accessControlsSubject = new BehaviorSubject<AccessControl[]>([]);
    public currentUser$ = this.currentUserSubject.asObservable();
    public accessControls$ = this.accessControlsSubject.asObservable();
    private apiUrl = `${environment.apiUrl}/auth`;

    constructor(private router: Router, private http: HttpClient) {
        // Check local storage for persisted session
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUserSubject.next(JSON.parse(savedUser));
        }

        const savedAccessControls = localStorage.getItem('accessControls');
        if (savedAccessControls) {
            this.accessControlsSubject.next(JSON.parse(savedAccessControls));
        }
    }

    get currentUserValue(): User | null {
        return this.currentUserSubject.value;
    }

    get accessControlsSnapshot(): AccessControl[] {
        return this.accessControlsSubject.value;
    }

    login(username: string, password: string): Observable<boolean> {
        return this.http.post<any>(`${this.apiUrl}/login`, { username, password }).pipe(
            switchMap(response => {
                if (response && response.user) {
                    const user = response.user;
                    localStorage.setItem('currentUser', JSON.stringify(user));
                    this.currentUserSubject.next(user);
                    return this.loadAccessControls().pipe(map(() => true));
                }
                return of(false);
            }),
            catchError(error => {
                console.error('Login failed', error);
                return of(false);
            })
        );
    }

    logout() {
        localStorage.removeItem('currentUser');
        this.currentUserSubject.next(null);
        this.router.navigate(['/login']);
    }

    // Admin: Create or Update User (Using Register API for create, Update for edit)
    saveUser(user: User): boolean {
        // This method was synchronous mock, now needs to be async.
        // However, to minimize refactoring in components, we might need to subscribe here 
        // OR better: update components to handle Observable.
        // For quick integration, I'll return Observable and update components.
        console.warn('saveUser is now async, components need update');
        return false; // Deprecated sync call
    }

    // Asynchronous version for components to use
    saveUserAsync(user: User): Observable<any> {
        if (user.id && user.id.length < 10 && !isNaN(Number(user.id))) {
            // Basic check if it's an existing numeric ID (from DB) or our string assumption
            // Actually, if we are editing, we should have an ID.
            return this.updateUser(user);
        }

        // If ID is new/temp (like Date.now() from component), treat as create
        // But backend generates ID or we pass it. The component generates `Date.now()`.
        // Let's rely on backend Register
        return this.http.post(`${this.apiUrl}/register`, user).pipe(
            map(res => {
                // If updating self
                if (this.currentUserValue && this.currentUserValue.username === user.username) {
                    const { password, ...safeUser } = user;
                    localStorage.setItem('currentUser', JSON.stringify(safeUser));
                    this.currentUserSubject.next(safeUser);
                }
                return res;
            })
        );
    }

    updateUser(user: User): Observable<any> {
        return this.http.put(`${this.apiUrl}/users/${user.id}`, user).pipe(
            map(res => {
                if (this.currentUserValue && this.currentUserValue.id === user.id) {
                    const { password, ...safeUser } = user;
                    localStorage.setItem('currentUser', JSON.stringify(safeUser));
                    this.currentUserSubject.next(safeUser);
                }
                return res;
            })
        );
    }

    changePassword(id: string, oldPassword: string, newPassword: string, confirmPassword: string): Observable<any> {
        return this.http.put(`${this.apiUrl}/users/${id}/password`, {
            oldPassword,
            newPassword,
            confirmPassword
        });
    }

    deleteUser(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/users/${id}`);
    }

    getUsers(): Observable<User[]> {
        return this.http.get<User[]>(`${this.apiUrl}/users`);
    }

    loadAccessControls(): Observable<AccessControl[]> {
        return this.http.get<AccessControl[]>(`${this.apiUrl}/access-controls`).pipe(
            map(controls => controls || []),
            tap(controls => {
                localStorage.setItem('accessControls', JSON.stringify(controls));
                this.accessControlsSubject.next(controls);
            })
        );
    }

    ensureAccessControlsLoaded(): Observable<AccessControl[]> {
        const currentControls = this.accessControlsSubject.value;
        return currentControls.length > 0 ? of(currentControls) : this.loadAccessControls();
    }

    updateAccessControls(controls: AccessControl[]): Observable<AccessControl[]> {
        return this.http.put<{ message: string; controls: AccessControl[] }>(`${this.apiUrl}/access-controls`, { controls }).pipe(
            map(response => response.controls || []),
            tap(updatedControls => {
                localStorage.setItem('accessControls', JSON.stringify(updatedControls));
                this.accessControlsSubject.next(updatedControls);
            })
        );
    }

    hasTabAccess(role: User['role'] | undefined, tabKey: AccessTab): boolean {
        if (!role) {
            return false;
        }

        if (role === 'admin' || role === 'doctor') {
            return true;
        }

        if (role !== 'receptionist' && role !== 'billing') {
            return false;
        }

        const assignedDoctorId = this.currentUserSubject.value?.assignedDoctorId;
        if (!assignedDoctorId) {
            return false;
        }

        const controls = this.getAccessControlsForDoctor(assignedDoctorId);
        const control = controls.find(item => item.targetRole === role && item.tabKey === tabKey);
        return control ? control.isAllowed : false;
    }

    getAccessControlsForDoctor(doctorId: string): AccessControl[] {
        return this.defaultAccessControlTemplate.map(defaultControl => {
            const savedControl = this.accessControlsSubject.value.find(control =>
                control.doctorId === doctorId
                && control.targetRole === defaultControl.targetRole
                && control.tabKey === defaultControl.tabKey
            );

            return savedControl || { doctorId, ...defaultControl };
        });
    }

    mergeDoctorAccessControls(doctorId: string, controls: AccessControl[]): AccessControl[] {
        const otherDoctorControls = this.accessControlsSubject.value.filter(control => control.doctorId !== doctorId);
        const mergedDoctorControls = this.defaultAccessControlTemplate.map(defaultControl => {
            const savedControl = controls.find(control =>
                control.doctorId === doctorId
                && control.targetRole === defaultControl.targetRole
                && control.tabKey === defaultControl.tabKey
            );

            return savedControl || { doctorId, ...defaultControl };
        });

        return [...otherDoctorControls, ...mergedDoctorControls];
    }
}
