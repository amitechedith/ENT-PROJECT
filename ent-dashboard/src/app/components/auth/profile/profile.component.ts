import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { PasswordModule } from 'primeng/password';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, CardModule, PasswordModule],
    templateUrl: './profile.component.html'
})
export class ProfileComponent implements OnInit {
    profileForm!: FormGroup;
    passwordForm!: FormGroup;
    currentUser: User | null = null;
    loading = false;
    passwordLoading = false;

    constructor(
        private fb: FormBuilder,
        private authService: AuthService
    ) { }

    ngOnInit() {
        this.currentUser = this.authService.currentUserValue;
        this.initForm();
        this.initPasswordForm();
    }

    initForm() {
        this.profileForm = this.fb.group({
            username: [{ value: this.currentUser?.username, disabled: true }],
            role: [{ value: this.currentUser?.role, disabled: true }],
            fullName: [this.currentUser?.fullName, Validators.required],
            mobile: [this.currentUser?.mobile || '', [Validators.required, Validators.pattern('^[0-9]{10}$')]]
        });
    }

    initPasswordForm() {
        this.passwordForm = this.fb.group({
            oldPassword: ['', Validators.required],
            newPassword: ['', [Validators.required, Validators.minLength(4)]],
            confirmPassword: ['', Validators.required]
        }, { validators: this.passwordMatchValidator });
    }

    get canUpdatePassword(): boolean {
        return !!this.currentUser && this.currentUser.role !== 'admin';
    }

    passwordMatchValidator(form: AbstractControl): ValidationErrors | null {
        const newPassword = form.get('newPassword')?.value;
        const confirmPassword = form.get('confirmPassword')?.value;

        return newPassword && confirmPassword && newPassword !== confirmPassword
            ? { passwordMismatch: true }
            : null;
    }

    isInvalid(form: FormGroup, fieldName: string): boolean {
        const control = form.get(fieldName);
        return !!control && control.invalid && (control.touched || control.dirty);
    }

    isPasswordMismatch(): boolean {
        const confirmControl = this.passwordForm.get('confirmPassword');
        return this.passwordForm.hasError('passwordMismatch')
            && !!confirmControl?.value
            && !!(confirmControl?.touched || confirmControl?.dirty);
    }

    markFormTouched(form: FormGroup): void {
        Object.values(form.controls).forEach(control => {
            control.markAsTouched();
            control.updateValueAndValidity();
        });
    }

    updateProfile() {
        if (this.profileForm.valid && this.currentUser) {
            const formVal = this.profileForm.getRawValue(); // use getRawValue to include disabled fields if needed

            const updatedUser: User = {
                ...this.currentUser,
                fullName: formVal.fullName,
                mobile: formVal.mobile
            };

            this.loading = true;
            this.authService.updateUser(updatedUser).subscribe({
                next: () => {
                    this.loading = false;
                    alert('Profile updated successfully!');
                },
                error: (err) => {
                    this.loading = false;
                    alert('Failed to update profile.');
                }
            });
            return;
        }

        this.markFormTouched(this.profileForm);
    }

    updatePassword() {
        if (!this.canUpdatePassword || !this.currentUser) {
            return;
        }

        if (this.passwordForm.invalid) {
            this.markFormTouched(this.passwordForm);
            return;
        }

        const formVal = this.passwordForm.value;
        this.passwordLoading = true;

        this.authService.changePassword(
            this.currentUser.id,
            formVal.oldPassword,
            formVal.newPassword,
            formVal.confirmPassword
        ).subscribe({
            next: () => {
                this.passwordLoading = false;
                this.passwordForm.reset();
                alert('Password updated successfully!');
            },
            error: (err) => {
                this.passwordLoading = false;
                alert(err.error?.message || 'Failed to update password.');
            }
        });
    }
}
