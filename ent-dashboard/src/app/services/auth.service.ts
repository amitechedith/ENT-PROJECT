import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User } from '../models/user.model';
import { BehaviorSubject, Observable, map, of, catchError } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private currentUserSubject = new BehaviorSubject<User | null>(null);
    public currentUser$ = this.currentUserSubject.asObservable();
    private apiUrl = `${environment.apiUrl}/auth`;

    constructor(private router: Router, private http: HttpClient) {
        // Check local storage for persisted session
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUserSubject.next(JSON.parse(savedUser));
        }
    }

    get currentUserValue(): User | null {
        return this.currentUserSubject.value;
    }

    login(username: string, password: string): Observable<boolean> {
        return this.http.post<any>(`${this.apiUrl}/login`, { username, password }).pipe(
            map(response => {
                if (response && response.user) {
                    const user = response.user;
                    localStorage.setItem('currentUser', JSON.stringify(user));
                    this.currentUserSubject.next(user);
                    return true;
                }
                return false;
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
}
