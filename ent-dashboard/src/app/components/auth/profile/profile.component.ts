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
            mobile: [this.currentUser?.mobile || '', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
            doctorTitle: [this.currentUser?.doctorTitle || ''],
            doctorRegistrationNumber: [this.currentUser?.doctorRegistrationNumber || ''],
            doctorClinicAddress: [this.currentUser?.doctorClinicAddress || ''],
            doctorClinicPhone: [this.currentUser?.doctorClinicPhone || ''],
            doctorEmail: [this.currentUser?.doctorEmail || ''],
            doctorTimings: [this.currentUser?.doctorTimings || ''],
            defaultConsultationFee: [this.getFeeInputValue(this.currentUser?.defaultConsultationFee)]
        });

        this.updateDoctorFieldValidators();
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

    get isDoctorProfile(): boolean {
        return this.currentUser?.role === 'doctor';
    }

    getFeeInputValue(value: User['defaultConsultationFee']): number {
        const fee = Number(value);
        return Number.isFinite(fee) && fee > 0 ? fee : 500;
    }

    private updateDoctorFieldValidators(): void {
        const doctorFields = [
            'doctorTitle',
            'doctorRegistrationNumber',
            'doctorClinicAddress',
            'doctorClinicPhone',
            'doctorEmail',
            'doctorTimings',
            'defaultConsultationFee'
        ];

        doctorFields.forEach(fieldName => {
            const control = this.profileForm.get(fieldName);
            if (!control) {
                return;
            }

            if (this.isDoctorProfile) {
                if (fieldName === 'doctorEmail') {
                    control.setValidators([Validators.required, Validators.email]);
                } else if (fieldName === 'defaultConsultationFee') {
                    control.setValidators([Validators.required, Validators.min(1)]);
                } else {
                    control.setValidators([Validators.required]);
                }
            } else {
                control.clearValidators();
            }

            control.updateValueAndValidity({ emitEvent: false });
        });
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
                mobile: formVal.mobile,
                doctorTitle: this.isDoctorProfile ? formVal.doctorTitle : this.currentUser.doctorTitle,
                doctorRegistrationNumber: this.isDoctorProfile ? formVal.doctorRegistrationNumber : this.currentUser.doctorRegistrationNumber,
                doctorClinicAddress: this.isDoctorProfile ? formVal.doctorClinicAddress : this.currentUser.doctorClinicAddress,
                doctorClinicPhone: this.isDoctorProfile ? formVal.doctorClinicPhone : this.currentUser.doctorClinicPhone,
                doctorEmail: this.isDoctorProfile ? formVal.doctorEmail : this.currentUser.doctorEmail,
                doctorTimings: this.isDoctorProfile ? formVal.doctorTimings : this.currentUser.doctorTimings,
                defaultConsultationFee: this.isDoctorProfile ? Number(formVal.defaultConsultationFee || 0) : this.currentUser.defaultConsultationFee
            };

            this.loading = true;
            this.authService.updateUser(updatedUser).subscribe({
                next: () => {
                    this.loading = false;
                    this.currentUser = updatedUser;
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
