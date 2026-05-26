import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { PasswordModule } from 'primeng/password';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, PasswordModule, InputTextModule, ButtonModule],
    templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit {
    loginForm!: FormGroup;
    loading = false;
    submitted = false;
    returnUrl: string = '/';
    error = '';

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private authService: AuthService
    ) {
        // redirect to home if already logged in
        if (this.authService.currentUserValue) {
            this.router.navigate(['/']);
        }
    }

    ngOnInit() {
        this.loginForm = this.formBuilder.group({
            username: ['', Validators.required],
            password: ['', Validators.required]
        });

        // get return url from route parameters or default to '/'
        this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
    }

    // convenience getter for easy access to form fields
    get f() { return this.loginForm.controls; }

    onSubmit() {
        this.submitted = true;

        // stop here if form is invalid
        if (this.loginForm.invalid) {
            return;
        }

        this.loading = true;
        this.authService.login(this.f['username'].value, this.f['password'].value)
            .subscribe({
                next: (success) => {
                    if (success) {
                        const user = this.authService.currentUserValue;
                        if (user?.role === 'doctor') this.router.navigate(['/doctor/dashboard']);
                        else if (user?.role === 'receptionist') this.router.navigate(['/reception']);
                        else if (user?.role === 'billing') this.router.navigate(['/billing']);
                        else if (user?.role === 'admin') this.router.navigate(['/admin']);
                        else this.router.navigate([this.returnUrl]);
                    } else {
                        this.error = 'Invalid username or password';
                        this.loading = false;
                    }
                },
                error: error => {
                    this.error = error;
                    this.loading = false;
                }
            });
    }
}
